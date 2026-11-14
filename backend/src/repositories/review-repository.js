import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { displayName } from './organization-repository.js';
import { requestError } from '../engines/request-error.js';

// Averages are hidden until this many ratings are published, so a single
// rating cannot be read back from the aggregate.
export const RATING_MINIMUM_COUNT = 3;

const reviewSelect = `
  SELECT r.*, ${displayName('ap')} AS author_name, ap.profile_picture_url AS author_picture_url
  FROM profile_reviews r JOIN users au ON au.id = r.author_id AND au.is_active AND NOT au.is_deleted
  LEFT JOIN profiles ap ON ap.user_id = r.author_id`;

const notBlocked = (alias, viewer) => `NOT EXISTS(SELECT 1 FROM blocked_users b
  WHERE (b.user_id = ${viewer} AND b.blocked_user_id = ${alias}) OR (b.user_id = ${alias} AND b.blocked_user_id = ${viewer}))`;

function reviewView(row) {
  return {
    id: row.id, authorId: row.author_id, authorName: row.author_name, authorPictureUrl: row.author_picture_url,
    subjectId: row.subject_id, stars: row.stars, body: row.body, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at, approvedAt: row.approved_at,
  };
}

const average = (total, count) => (count ? Math.round((Number(total) / count) * 10) / 10 : null);

class ReviewRepository {
  // Resolves an artist profile (by user or profile ID) the viewer may see.
  async subject(executor, reference, viewerId) {
    const { rows } = await executor.execute(`
      SELECT u.id, ${displayName('p')} AS name FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE (u.id = $1 OR p.id = $1) AND u.is_active AND NOT u.is_deleted AND p.account_kind = 'artist'
        AND ${notBlocked('u.id', '$2::uuid')}`, [reference.toLowerCase(), viewerId]);
    if (!rows.length) throw requestError(404, 'PROFILE_NOT_FOUND', 'Musician not found');
    return rows[0];
  }

  async mutual(executor, first, second) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM followers
      WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`, [first, second]);
    return rows[0].count === 2;
  }

  async list(reference, viewerId, { page, pageSize }) {
    const executor = realmConnector;
    const subject = await this.subject(executor, reference, viewerId);
    const { rows: [summary] } = await executor.execute(`
      SELECT COUNT(*)::int AS count, COALESCE(SUM(r.stars), 0)::int AS total
      FROM profile_reviews r JOIN users au ON au.id = r.author_id AND au.is_active AND NOT au.is_deleted
      WHERE r.subject_id = $1 AND r.status = 'approved'`, [subject.id]);
    const { rows } = await executor.execute(`${reviewSelect}
      WHERE r.subject_id = $1 AND r.status = 'approved' AND ${notBlocked('r.author_id', '$2::uuid')}
      ORDER BY r.approved_at DESC NULLS LAST, r.id DESC LIMIT $3 OFFSET $4`,
    [subject.id, viewerId, pageSize + 1, (page - 1) * pageSize]);
    const own = subject.id === viewerId;
    const mine = own ? null : (await executor.execute(`${reviewSelect} WHERE r.subject_id = $1 AND r.author_id = $2`, [subject.id, viewerId])).rows[0];
    const awaiting = own ? (await executor.execute(`${reviewSelect}
      WHERE r.subject_id = $1 AND r.status IN ('pending', 'hidden') ORDER BY r.status, r.updated_at DESC, r.id LIMIT 100`, [subject.id])).rows : [];
    return {
      subjectId: subject.id,
      summary: { count: summary.count, average: average(summary.total, summary.count) },
      rows: rows.map(reviewView),
      mine: mine ? reviewView(mine) : null,
      manage: own ? { pending: awaiting.filter(row => row.status === 'pending').map(reviewView), hidden: awaiting.filter(row => row.status === 'hidden').map(reviewView) } : null,
      canReview: !own && await this.mutual(executor, subject.id, viewerId),
    };
  }

  async write(reference, authorId, { stars, body }) {
    return realmConnector.transaction(async executor => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [authorId]);
      const subject = await this.subject(executor, reference, authorId);
      if (subject.id === authorId) throw requestError(400, 'INVALID_REVIEW', 'You cannot review yourself');
      if (!await this.mutual(executor, subject.id, authorId)) {
        throw requestError(403, 'REVIEW_REQUIRES_MUTUAL_FOLLOW', 'You can review a musician only while you follow each other');
      }
      const { rows } = await executor.execute(`
        INSERT INTO profile_reviews (author_id, subject_id, stars, body) VALUES ($1, $2, $3, $4)
        ON CONFLICT (author_id, subject_id) DO UPDATE SET stars = EXCLUDED.stars, body = EXCLUDED.body,
          status = 'pending', approved_at = NULL, updated_at = NOW()
        RETURNING *, (xmax = 0) AS created`, [authorId, subject.id, stars, body]);
      const review = rows[0];
      const { rows: [author] } = await executor.execute(`SELECT ${displayName('p')} AS name FROM profiles p WHERE p.user_id = $1`, [authorId]);
      await notificationRepository.create(executor, {
        userId: subject.id, kind: 'review_received',
        title: review.created ? 'You received a new review to approve' : 'A review of your profile was edited and needs approval',
        link: '#profile?section=reviews', key: `review:${review.id}:${new Date(review.updated_at).getTime()}`,
        params: { reviewId: review.id, authorId, name: author?.name ?? null, edited: !review.created },
      });
      await publishEvent(executor, 'reviews.changed', { userId: subject.id, id: subject.id });
      await publishEvent(executor, 'reviews.changed', { userId: authorId, id: subject.id });
      return { ...reviewView({ ...review, author_name: author?.name }), created: review.created };
    });
  }

  async removeOwn(reference, authorId) {
    return realmConnector.transaction(async executor => {
      const subject = await this.subject(executor, reference, authorId);
      const { rowCount } = await executor.execute('DELETE FROM profile_reviews WHERE author_id = $1 AND subject_id = $2', [authorId, subject.id]);
      if (!rowCount) throw requestError(404, 'REVIEW_NOT_FOUND', 'Review not found');
      await this.changed(executor, subject.id, authorId);
    });
  }

  async changed(executor, subjectId, authorId) {
    await publishEvent(executor, 'reviews.changed', { userId: subjectId, id: subjectId });
    await publishEvent(executor, 'reviews.changed', { userId: authorId, id: subjectId });
    await publishEvent(executor, 'reviews.changed', { id: subjectId });
  }

  // The reviewed musician approves or hides a review.
  async moderate(reviewId, subjectId, status) {
    return realmConnector.transaction(async executor => {
      const { rows: current } = await executor.execute(
        'SELECT status FROM profile_reviews WHERE id = $1 AND subject_id = $2 FOR UPDATE', [reviewId, subjectId]);
      if (!current.length) throw requestError(404, 'REVIEW_NOT_FOUND', 'Review not found');
      const { rows } = await executor.execute(`
        UPDATE profile_reviews SET status = $2,
          approved_at = CASE WHEN $2 = 'approved' THEN COALESCE(approved_at, NOW()) ELSE approved_at END
        WHERE id = $1 RETURNING *`, [reviewId, status]);
      const review = rows[0];
      if (status === 'approved' && current[0].status === 'pending') {
        await notificationRepository.create(executor, {
          userId: review.author_id, kind: 'review_approved', title: 'Your review was approved',
          link: `#musician?id=${subjectId}`, key: `review-approved:${review.id}:${new Date(review.updated_at).getTime()}`,
          params: { reviewId: review.id, subjectId },
        });
      }
      await this.changed(executor, subjectId, review.author_id);
      return { id: review.id, status: review.status };
    });
  }

  // The author or the reviewed musician deletes a review.
  async remove(reviewId, userId) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        DELETE FROM profile_reviews WHERE id = $1 AND $2 IN (author_id, subject_id) RETURNING subject_id, author_id`, [reviewId, userId]);
      if (!rows.length) throw requestError(404, 'REVIEW_NOT_FOUND', 'Review not found');
      await this.changed(executor, rows[0].subject_id, rows[0].author_id);
    });
  }
}

// Anonymous ratings: one per rater and profile. Only the rater can read their
// own rating; everyone else, including the profile owner and administrators,
// sees only the published aggregate.
class ProfileRatingRepository {
  async summary(reference, viewerId) {
    const subject = await reviewRepository.subject(realmConnector, reference, viewerId);
    const { rows: [stats] } = await realmConnector.execute(
      'SELECT rating_count, star_total, published_at FROM profile_rating_stats WHERE subject_id = $1', [subject.id]);
    const { rows: [mine] } = subject.id === viewerId ? { rows: [] } : await realmConnector.execute(
      'SELECT stars, updated_at FROM profile_ratings WHERE rater_id = $1 AND subject_id = $2', [viewerId, subject.id]);
    const count = stats?.rating_count ?? 0;
    return {
      subjectId: subject.id, count, minimumCount: RATING_MINIMUM_COUNT,
      average: count >= RATING_MINIMUM_COUNT ? average(stats.star_total, count) : null,
      publishedAt: stats?.published_at ?? null,
      mine: mine ? { stars: mine.stars, updatedAt: mine.updated_at } : null,
      canRate: subject.id !== viewerId,
    };
  }

  async rate(reference, raterId, stars) {
    return realmConnector.transaction(async executor => {
      const subject = await reviewRepository.subject(executor, reference, raterId);
      if (subject.id === raterId) throw requestError(400, 'INVALID_RATING', 'You cannot rate yourself');
      const { rows } = await executor.execute(`
        INSERT INTO profile_ratings (rater_id, subject_id, stars) VALUES ($1, $2, $3)
        ON CONFLICT (rater_id, subject_id) DO UPDATE SET stars = EXCLUDED.stars, updated_at = NOW()
        RETURNING stars, updated_at`, [raterId, subject.id, stars]);
      await publishEvent(executor, 'ratings.changed', { userId: raterId, id: subject.id });
      return { stars: rows[0].stars, updatedAt: rows[0].updated_at };
    });
  }

  async remove(reference, raterId) {
    return realmConnector.transaction(async executor => {
      const subject = await reviewRepository.subject(executor, reference, raterId);
      const { rowCount } = await executor.execute('DELETE FROM profile_ratings WHERE rater_id = $1 AND subject_id = $2', [raterId, subject.id]);
      if (!rowCount) throw requestError(404, 'RATING_NOT_FOUND', 'You have not rated this profile');
      await publishEvent(executor, 'ratings.changed', { userId: raterId, id: subject.id });
    });
  }

  // Republishes every aggregate at once, so rating changes become visible in
  // daily batches instead of the moment a rater acts.
  async publish(executor = realmConnector) {
    await executor.execute(`
      INSERT INTO profile_rating_stats (subject_id, rating_count, star_total, published_at)
      SELECT r.subject_id, COUNT(*)::int, SUM(r.stars)::int, NOW() FROM profile_ratings r
      JOIN users u ON u.id = r.rater_id AND u.is_active AND NOT u.is_deleted
      GROUP BY r.subject_id
      ON CONFLICT (subject_id) DO UPDATE SET rating_count = EXCLUDED.rating_count, star_total = EXCLUDED.star_total,
        published_at = EXCLUDED.published_at`);
    const { rowCount } = await executor.execute(`
      DELETE FROM profile_rating_stats s WHERE NOT EXISTS(
        SELECT 1 FROM profile_ratings r JOIN users u ON u.id = r.rater_id AND u.is_active AND NOT u.is_deleted
        WHERE r.subject_id = s.subject_id)`);
    return { removed: rowCount };
  }
}

export const reviewRepository = new ReviewRepository();
export const profileRatingRepository = new ProfileRatingRepository();
