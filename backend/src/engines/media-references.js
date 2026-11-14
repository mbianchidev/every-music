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
  `EXISTS(SELECT 1 FROM organizations o WHERE o.picture_url = $2 AND o.is_deleted = FALSE)`,
  `EXISTS(SELECT 1 FROM organization_photos ph JOIN organizations o ON o.id = ph.organization_id
    WHERE ph.url = $2 AND o.is_deleted = FALSE)`,
];
