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
  `EXISTS(SELECT 1 FROM organizations o WHERE o.picture_url = $2 AND o.is_deleted = FALSE)`,
  `EXISTS(SELECT 1 FROM organization_photos ph JOIN organizations o ON o.id = ph.organization_id
    WHERE ph.url = $2 AND o.is_deleted = FALSE)`,
];

// SQL predicates granting one signed-in viewer (bound as $3) access to managed
// media (URL bound as $2) that is not public, for example attachments shared
// in a group conversation or verification evidence under admin review. Each
// predicate must check the viewer's current right to the referencing content.
// Matches are served with `Cache-Control: private, no-store`. Attachment blobs
// are never served through publicMediaReferences, only through these.
export const authorizedMediaReferences = [];

// SQL predicates (URL bound as $2) that keep media from the hourly orphan
// cleanup, which deletes unreferenced uploads older than one day together with
// their stored objects. Media matching publicMediaReferences is kept too; add
// a predicate here when drafts, private or member-only content reference media.
export const retainedMediaReferences = [
  'EXISTS(SELECT 1 FROM profiles p WHERE p.profile_picture_url = $2)',
  'EXISTS(SELECT 1 FROM announcements a WHERE a.picture_url = $2 AND a.is_deleted = FALSE)',
  "EXISTS(SELECT 1 FROM marketplace_listing_photos ph WHERE '/realm/media/' || ph.media_id::text = $2)",
  "EXISTS(SELECT 1 FROM verification_requests v WHERE $2 IN ('/realm/media/' || v.selfie_media_id::text, '/realm/media/' || v.document_media_id::text))",
];
