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
  `EXISTS(SELECT 1 FROM sponsored_cards c WHERE (c.image_url = $2 OR '/realm/media/' || c.video_media_id::text = $2)
    AND c.is_active AND c.starts_at <= NOW() AND (c.ends_at IS NULL OR c.ends_at > NOW()))`,
  `EXISTS(SELECT 1 FROM event_images ei JOIN events e ON e.id = ei.event_id
    WHERE ('/realm/media/' || ei.media_id::text) = $2 AND e.visibility = 'published' AND CASE WHEN e.owner_user_id IS NOT NULL
      THEN EXISTS(SELECT 1 FROM users ou WHERE ou.id = e.owner_user_id AND ou.is_active AND NOT ou.is_deleted)
      ELSE EXISTS(SELECT 1 FROM event_organizers vo JOIN organizations vg ON vg.id = vo.organization_id AND NOT vg.is_deleted
        WHERE vo.event_id = e.id) END)`,
];

// SQL predicates granting one signed-in viewer (bound as $3) access to managed
// media (URL bound as $2) that is not public, for example attachments shared
// in a group conversation or verification evidence under admin review. Each
// predicate must check the viewer's current right to the referencing content.
// Matches are served with `Cache-Control: private, no-store`. Attachment blobs
// are never served through publicMediaReferences, only through these.
export const authorizedMediaReferences = [
  // Draft event images for everyone who may edit the event.
  `EXISTS(SELECT 1 FROM event_images ei JOIN events e ON e.id = ei.event_id
    WHERE ('/realm/media/' || ei.media_id::text) = $2 AND (e.owner_user_id = $3 OR EXISTS(
      SELECT 1 FROM event_organizers eo JOIN organizations o ON o.id = eo.organization_id AND o.is_deleted = FALSE
      JOIN organization_members m ON m.organization_id = o.id AND m.status = 'active' AND m.user_id = $3
      WHERE eo.event_id = e.id AND (m.role IN ('leader', 'admin') OR 'manage_calendar' = ANY(m.permissions)))))`,
  // Band chat attachments: current band members whose chat period began
  // before the message. Aliases avoid `m`, the media row in the reading query.
  `EXISTS(SELECT 1 FROM band_chat_attachments ba
    JOIN band_chat_messages bm ON bm.id = ba.message_id AND NOT bm.is_deleted
    JOIN organizations bo ON bo.id = bm.organization_id AND NOT bo.is_deleted
    JOIN organization_members bom ON bom.organization_id = bm.organization_id AND bom.user_id = $3 AND bom.status = 'active'
    JOIN band_chat_members bc ON bc.organization_id = bm.organization_id AND bc.user_id = $3
      AND bc.left_at IS NULL AND bc.joined_at <= bm.created_at
    WHERE ('/realm/media/' || ba.media_id::text) = $2)`,
];

// SQL predicates (URL bound as $2) that keep media from the hourly orphan
// cleanup, which deletes unreferenced uploads older than one day together with
// their stored objects. Media matching publicMediaReferences is kept too; add
// a predicate here when drafts, private or member-only content reference media.
export const retainedMediaReferences = [
  'EXISTS(SELECT 1 FROM profiles p WHERE p.profile_picture_url = $2)',
  'EXISTS(SELECT 1 FROM announcements a WHERE a.picture_url = $2 AND a.is_deleted = FALSE)',
  "EXISTS(SELECT 1 FROM marketplace_listing_photos ph WHERE '/realm/media/' || ph.media_id::text = $2)",
  "EXISTS(SELECT 1 FROM verification_requests v WHERE $2 IN ('/realm/media/' || v.selfie_media_id::text, '/realm/media/' || v.document_media_id::text))",
  "EXISTS(SELECT 1 FROM sponsored_cards c WHERE c.image_url = $2 OR '/realm/media/' || c.video_media_id::text = $2)",
  "EXISTS(SELECT 1 FROM event_images ei WHERE '/realm/media/' || ei.media_id::text = $2)",
  "EXISTS(SELECT 1 FROM band_chat_attachments ba WHERE ('/realm/media/' || ba.media_id::text) = $2)",
];
