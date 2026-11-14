// SQL predicates proving that a managed media URL (bound as $2) is referenced
// by content anyone may see. Uploaders can always read their own media; any
// other read needs one of these. Append one predicate per feature that shows
// managed images publicly, and keep each predicate's visibility rules in sync
// with that feature's read endpoints.
export const publicMediaReferences = [
  `EXISTS(SELECT 1 FROM profiles p JOIN users u ON u.id = p.user_id
    WHERE p.profile_picture_url = $2 AND u.is_active = TRUE AND u.is_deleted = FALSE)`,
  `EXISTS(SELECT 1 FROM announcements a JOIN users u ON u.id = a.user_id AND u.is_active AND NOT u.is_deleted
    WHERE a.picture_url = $2 AND a.is_published = TRUE
    AND a.is_deleted = FALSE AND (a.expires_at IS NULL OR a.expires_at > NOW()))`,
  `EXISTS(SELECT 1 FROM marketplace_listing_photos ph JOIN marketplace_listings l ON l.id = ph.listing_id
    JOIN users u ON u.id = l.user_id AND u.is_active AND NOT u.is_deleted
    WHERE ('/realm/media/' || ph.media_id::text) = $2 AND l.removed_at IS NULL AND l.expires_at > NOW())`,
];

// SQL predicates (the media row is aliased `m`) that keep an upload from the
// hourly orphan cleanup, which deletes media older than a day matching none of
// them. Append one predicate per feature that stores managed media references.
export const retainedMediaReferences = [
  `EXISTS(SELECT 1 FROM profiles p WHERE p.profile_picture_url = '/realm/media/' || m.id)`,
  `EXISTS(SELECT 1 FROM announcements a WHERE a.picture_url = '/realm/media/' || m.id AND a.is_deleted = FALSE)`,
  'EXISTS(SELECT 1 FROM marketplace_listing_photos ph WHERE ph.media_id = m.id)',
  'EXISTS(SELECT 1 FROM verification_requests v WHERE m.id IN (v.selfie_media_id, v.document_media_id))',
];
