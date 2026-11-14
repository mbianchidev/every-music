import { opportunityRepository } from '../repositories/opportunity-repository.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { InputValidator } from '../validators/input-validator.js';
import { communityRepository, publishEvent } from '../repositories/community-repository.js';

export class OpportunityConductor {
  async createAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const announcementData = request.body ?? {};

    const validations = InputValidator.gatherValidationErrors(
      InputValidator.validateRequired(announcementData.title, 'Title'),
      InputValidator.validateLength(announcementData.title, 5, 255, 'Title'),
      InputValidator.validateRequired(announcementData.description, 'Description'),
      InputValidator.validateLength(announcementData.description, 20, 5000, 'Description'),
      InputValidator.validateImageUrl(announcementData.pictureUrl),
      InputValidator.validateCoordinates(announcementData.latitude, announcementData.longitude),
      InputValidator.validateBoolean(announcementData.isRemote, 'Remote'),
      InputValidator.validateBoolean(announcementData.isCoverBand, 'Cover band'),
      InputValidator.validateBoolean(announcementData.isPublished, 'Published'),
      InputValidator.validateUuidArray(announcementData.instrumentIds, 'Instrument IDs'),
      InputValidator.validateUuidArray(announcementData.genreIds, 'Genre IDs'),
      InputValidator.validateLinks(announcementData.links),
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
    }

    try {
      const fullAnnouncement = await realmConnector.transaction(async (executor) => {
        const pictureUrl = await communityRepository.mediaReference(executor, announcementData.pictureUrl, userId, 'announcement');
        const announcement = await opportunityRepository.createAnnouncement(
          userId,
          { ...announcementData, pictureUrl },
          executor,
        );
        await opportunityRepository.attachInstruments(
          announcement.id,
          announcementData.instrumentIds || [],
          executor,
        );
        await opportunityRepository.attachGenres(
          announcement.id,
          announcementData.genreIds || [],
          executor,
        );
        await opportunityRepository.attachLinks(
          announcement.id,
          announcementData.links || [],
          executor,
        );
        const full = await opportunityRepository.findById(announcement.id, executor);
        if (full.is_published) await communityRepository.announcementPublished(executor, full);
        return full;
      });

      return reply.code(201).send({
        success: true,
        data: this.transformAnnouncement(fullAnnouncement),
      });
    } catch (err) {
      if (err.statusCode) throw err;
      request.log.error({ err }, 'Failed to create announcement');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'CREATE_FAILED',
          message: 'Failed to create announcement',
        },
      });
    }
  }

  async getMyAnnouncements(request, reply) {
    const { userId } = request.authenticatedUser;
    const parsed = InputValidator.parsePagination(request.query.page, request.query.pageSize);
    if (!parsed.valid) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: parsed.message } });
    const pagination = parsed.pagination;

    try {
      const announcements = await opportunityRepository.findByUserId(userId, { ...pagination, limit: pagination.pageSize + 1 });

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements.slice(0, pagination.pageSize).map(a => this.transformBasicAnnouncement(a)),
          pagination: { ...pagination, hasMore: announcements.length > pagination.pageSize },
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch announcements');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch announcements',
        },
      });
    }
  }

  async getAnnouncementById(request, reply) {
    const { announcementId } = request.params;
    const currentUserId = request.authenticatedUser?.userId;

    try {
      const announcement = await opportunityRepository.findById(announcementId, realmConnector, currentUserId);

      if (!announcement || (announcement.user_id !== currentUserId && (!announcement.is_published
        || (announcement.expires_at && new Date(announcement.expires_at) <= new Date())))) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: this.transformAnnouncement(announcement),
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch announcement');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch announcement',
        },
      });
    }
  }

  async searchAnnouncements(request, reply) {
    const {
      instrumentId,
      genreId,
      city,
      isRemote,
      isCoverBand,
      searchTerm,
      sort = 'newest',
      page = 1,
      pageSize = 20,
    } = request.query;

    const paginationResult = InputValidator.parsePagination(page, pageSize);
    const remoteResult = InputValidator.parseOptionalBoolean(isRemote, 'Remote');
    const coverBandResult = InputValidator.parseOptionalBoolean(isCoverBand, 'Cover band');
    const queryValidation = InputValidator.gatherValidationErrors(
      paginationResult,
      remoteResult,
      coverBandResult,
      InputValidator.validateUuid(instrumentId, 'Instrument ID'),
      InputValidator.validateUuid(genreId, 'Genre ID'),
      InputValidator.validateEnum(sort, ['newest', 'oldest', 'title', 'city', 'popular'], 'Sort'),
      InputValidator.validateLength(searchTerm, 0, 200, 'Search term'),
      InputValidator.validateLength(city, 0, 255, 'City'),
    );

    if (queryValidation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid search query',
          details: queryValidation,
        },
      });
    }

    try {
      const filters = {
        instrumentId,
        genreId,
        city,
        isRemote: remoteResult.value,
        isCoverBand: coverBandResult.value,
        searchTerm,
        sort,
        userId: request.authenticatedUser?.userId,
      };

      const pagination = paginationResult.pagination;
      const announcements = await opportunityRepository.searchAnnouncements(filters, {
        ...pagination,
        limit: pagination.pageSize + 1,
      });
      const hasMore = announcements.length > pagination.pageSize;

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements
            .slice(0, pagination.pageSize)
            .map(a => this.transformBasicAnnouncement(a)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore,
          },
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to search announcements');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Failed to search announcements',
        },
      });
    }
  }

  async updateAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;
    const updateData = request.body ?? {};

    const validations = InputValidator.gatherValidationErrors(
      updateData.title === undefined ? { valid: true } : InputValidator.validateRequired(updateData.title, 'Title'),
      updateData.description === undefined ? { valid: true } : InputValidator.validateRequired(updateData.description, 'Description'),
      InputValidator.validateLength(updateData.title, 5, 255, 'Title'),
      InputValidator.validateLength(updateData.description, 20, 5000, 'Description'),
      InputValidator.validateImageUrl(updateData.pictureUrl),
      InputValidator.validateCoordinates(updateData.latitude, updateData.longitude),
      InputValidator.validateBoolean(updateData.isRemote, 'Remote'),
      InputValidator.validateBoolean(updateData.isCoverBand, 'Cover band'),
      InputValidator.validateBoolean(updateData.isPublished, 'Published'),
      InputValidator.validateUuidArray(updateData.instrumentIds, 'Instrument IDs'),
      InputValidator.validateUuidArray(updateData.genreIds, 'Genre IDs'),
      InputValidator.validateLinks(updateData.links),
    );

    if (validations) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: validations,
        },
      });
    }

    try {
      const fullAnnouncement = await realmConnector.transaction(async (executor) => {
        const previous = await opportunityRepository.findById(announcementId, executor);
        if (!previous || previous.user_id !== userId) return null;
        const pictureUrl = await communityRepository.mediaReference(executor, updateData.pictureUrl, userId, 'announcement');
        const updated = await opportunityRepository.updateAnnouncement(
          announcementId,
          userId,
          { ...updateData, pictureUrl },
          executor,
        );

        if (!updated) {
          return null;
        }

        if (updateData.instrumentIds !== undefined) {
          await opportunityRepository.attachInstruments(
            announcementId,
            updateData.instrumentIds,
            executor,
          );
        }

        if (updateData.genreIds !== undefined) {
          await opportunityRepository.attachGenres(announcementId, updateData.genreIds, executor);
        }

        if (updateData.links !== undefined) {
          await opportunityRepository.attachLinks(announcementId, updateData.links, executor);
        }

        const full = await opportunityRepository.findById(announcementId, executor);
        if (!previous.is_published && full.is_published) {
          await communityRepository.announcementPublished(executor, full);
        } else {
          await publishEvent(executor, 'announcements.changed', {
            id: announcementId, userId: full.is_published || previous.is_published ? undefined : userId,
          });
        }
        return full;
      });

      if (!fullAnnouncement) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found or you do not have permission to update it',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: this.transformAnnouncement(fullAnnouncement),
      });
    } catch (err) {
      if (err.statusCode) throw err;
      request.log.error({ err }, 'Failed to update announcement');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: 'Failed to update announcement',
        },
      });
    }
  }

  async deleteAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;

    try {
      const result = await realmConnector.transaction(async (executor) => {
        const removed = await opportunityRepository.deleteAnnouncement(announcementId, userId, executor);
        if (removed) await publishEvent(executor, 'announcements.changed', { id: announcementId });
        return removed;
      });

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'ANNOUNCEMENT_NOT_FOUND',
            message: 'Announcement not found or you do not have permission to delete it',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Announcement deleted successfully',
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to delete announcement');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'DELETE_FAILED',
          message: 'Failed to delete announcement',
        },
      });
    }
  }

  async reactToAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;
    const { reactionType } = request.body ?? {};

    const validation = InputValidator.validateEnum(
      reactionType,
      ['like', 'dislike'],
      'Reaction type'
    );

    if (!validation.valid || !reactionType) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: validation.message || 'Choose a reaction',
        },
      });
    }

    try {
      await realmConnector.transaction(async (executor) => {
        const announcement = await communityRepository.visibleAnnouncement(executor, announcementId, userId);
        await communityRepository.lockMetricConsent(executor, userId, announcement.user_id);
        await opportunityRepository.lockAnnouncement(announcementId, executor);
        const previous = await executor.execute(
          'SELECT reaction_type FROM announcement_reactions WHERE announcement_id = $1 AND user_id = $2', [announcementId, userId],
        );
        await opportunityRepository.recordReaction(announcementId, userId, reactionType, executor);
        if (reactionType === 'like' && previous.rows[0]?.reaction_type !== 'like' && announcement.user_id !== userId) {
          await communityRepository.recordMetric(executor, userId, announcement.user_id, 'like', announcementId);
          await communityRepository.notify(executor, {
            userId: announcement.user_id, kind: 'reaction', title: 'Someone liked your announcement',
            link: `#announcement?id=${announcement.id}`, key: `reaction:${announcement.id}:${userId}`,
          });
        }
        await publishEvent(executor, 'announcements.changed', { id: announcementId });
      });

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Reaction recorded',
          reactionType,
        },
      });
    } catch (err) {
      if (err.statusCode) throw err;
      request.log.error({ err }, 'Failed to record reaction');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'REACTION_FAILED',
          message: 'Failed to record reaction',
        },
      });
    }
  }

  async saveAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;

    try {
      await realmConnector.transaction(async (executor) => {
        const announcement = await communityRepository.visibleAnnouncement(executor, announcementId, userId);
        const saved = await opportunityRepository.saveAnnouncement(announcementId, userId, executor);
        if (saved && announcement.user_id !== userId) {
          await communityRepository.recordMetric(executor, userId, announcement.user_id, 'save', announcementId);
        }
        await publishEvent(executor, 'saved.changed', { userId });
      });

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Announcement saved',
        },
      });
    } catch (err) {
      if (err.statusCode) throw err;
      request.log.error({ err }, 'Failed to save announcement');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'SAVE_FAILED',
          message: 'Failed to save announcement',
        },
      });
    }
  }

  async unsaveAnnouncement(request, reply) {
    const { userId } = request.authenticatedUser;
    const { announcementId } = request.params;

    try {
      const result = await realmConnector.transaction(async (executor) => {
        const removed = await opportunityRepository.unsaveAnnouncement(announcementId, userId, executor);
        if (removed) await publishEvent(executor, 'saved.changed', { userId });
        return removed;
      });

      if (!result) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SAVE_NOT_FOUND',
            message: 'Saved announcement not found',
          },
        });
      }

      return reply.code(200).send({
        success: true,
        data: {
          message: 'Announcement unsaved',
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to unsave announcement');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'UNSAVE_FAILED',
          message: 'Failed to unsave announcement',
        },
      });
    }
  }

  async getSavedAnnouncements(request, reply) {
    const { userId } = request.authenticatedUser;
    const { page = 1, pageSize = 20 } = request.query;

    const paginationResult = InputValidator.parsePagination(page, pageSize);
    if (!paginationResult.valid) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: paginationResult.message,
        },
      });
    }

    try {
      const pagination = paginationResult.pagination;
      const announcements = await opportunityRepository.getSavedAnnouncements(userId, {
        ...pagination,
        limit: pagination.pageSize + 1,
      });
      const hasMore = announcements.length > pagination.pageSize;

      return reply.code(200).send({
        success: true,
        data: {
          announcements: announcements
            .slice(0, pagination.pageSize)
            .map(a => this.transformBasicAnnouncement(a)),
          pagination: {
            page: pagination.page,
            pageSize: pagination.pageSize,
            hasMore,
          },
        },
      });
    } catch (err) {
      request.log.error({ err }, 'Failed to fetch saved announcements');
      return reply.code(500).send({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: 'Failed to fetch saved announcements',
        },
      });
    }
  }

  transformAnnouncement(announcement) {
    return {
      id: announcement.id,
      userId: announcement.user_id,
      creatorName: announcement.creator_name,
      title: announcement.title,
      description: announcement.description,
      pictureUrl: announcement.picture_url,
      location: {
        city: announcement.city,
        state: announcement.state,
        country: announcement.country,
        coordinates: announcement.latitude && announcement.longitude ? {
          latitude: parseFloat(announcement.latitude),
          longitude: parseFloat(announcement.longitude),
        } : null,
      },
      isRemote: announcement.is_remote,
      isCoverBand: announcement.is_cover_band,
      instruments: announcement.instruments || [],
      genres: announcement.genres || [],
      links: announcement.links || [],
      stats: {
        views: announcement.views_count,
        likes: announcement.likes_count,
        dislikes: announcement.dislikes_count,
      },
      expiresAt: announcement.expires_at,
      isPublished: announcement.is_published,
      isSaved: Boolean(announcement.is_saved),
      myReaction: announcement.my_reaction || null,
      createdAt: announcement.created_at,
      updatedAt: announcement.updated_at,
    };
  }

  transformBasicAnnouncement(announcement) {
    return {
      id: announcement.id,
      userId: announcement.user_id,
      title: announcement.title,
      description: announcement.description,
      pictureUrl: announcement.picture_url,
      location: {
        city: announcement.city,
        state: announcement.state,
        country: announcement.country,
      },
      isRemote: announcement.is_remote,
      isCoverBand: announcement.is_cover_band,
      isPublished: announcement.is_published,
      isSaved: Boolean(announcement.is_saved),
      stats: {
        views: announcement.views_count,
        likes: announcement.likes_count,
        dislikes: announcement.dislikes_count,
      },
      expiresAt: announcement.expires_at,
      createdAt: announcement.created_at,
    };
  }
}

export const opportunityConductor = new OpportunityConductor();
