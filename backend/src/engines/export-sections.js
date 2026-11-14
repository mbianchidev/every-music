// Extra sections of the self-service GDPR export (GET /realm/account/export).
// Each section is SQL whose rows belong to the exporting user, bound as $1,
// and returns only that user's own data: never other people's private text,
// secrets, hashes, or ciphertext. `single: true` returns the first row (or
// null) instead of a list. Append a section for every feature that stores
// personal data, and handle the feature's rows in account deletion.
export const exportSections = [
  {
    key: 'profileSettings', single: true, sql: `
      SELECT p.account_kind AS "accountKind", p.contact_visibility AS "contactVisibility",
        p.open_to_projects AS "openToProjects", pl.name AS "placeName", pl.country_code AS "placeCountry"
      FROM profiles p LEFT JOIN places pl ON pl.id = p.place_id WHERE p.user_id = $1`,
  },
  {
    key: 'profileLinks', sql: `
      SELECT l.link_type AS "type", l.url, l.position, l.created_at AS "createdAt"
      FROM profile_links l JOIN profiles p ON p.id = l.profile_id WHERE p.user_id = $1 ORDER BY l.position, l.created_at`,
  },
  {
    key: 'notificationChannels', sql: `
      SELECT kind, in_app AS "inApp", push, email, updated_at AS "updatedAt"
      FROM notification_channel_preferences WHERE user_id = $1 ORDER BY kind`,
  },
  {
    key: 'pushDevices', sql: `
      SELECT platform, created_at AS "createdAt", updated_at AS "updatedAt" FROM push_devices WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'savedSearches', sql: `
      SELECT id, name, filters, notify, created_at AS "createdAt" FROM saved_searches WHERE user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'profileVisitsMade', sql: `
      SELECT owner_id AS "visitedUserId", to_char(day, 'YYYY-MM-DD') AS day FROM profile_visits WHERE visitor_id = $1 ORDER BY day`,
  },
  {
    key: 'supportRequests', sql: `
      SELECT id, kind, subject, message, steps, link, status, reply_note AS "reply", created_at AS "createdAt", answered_at AS "answeredAt"
      FROM support_requests WHERE user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'termsAcceptances', sql: `
      SELECT terms_version AS "termsVersion", source, accepted_at AS "acceptedAt" FROM terms_acceptances WHERE user_id = $1 ORDER BY accepted_at`,
  },
  {
    key: 'onboarding', single: true, sql: `
      SELECT tour_status AS "tourStatus", tour_updated_at AS "updatedAt" FROM user_onboarding WHERE user_id = $1`,
  },
  {
    key: 'appRatings', sql: `
      SELECT app_version AS "appVersion", stars, comment, platform, rewarded_at AS "rewardedAt", created_at AS "createdAt"
      FROM app_ratings WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'applicationsSent', sql: `
      SELECT a.id, a.announcement_id AS "announcementId", a.message, a.links, a.status,
        COALESCE((SELECT jsonb_agg(i.name ORDER BY i.name) FROM application_instruments ai JOIN instruments i ON i.id = ai.instrument_id
          WHERE ai.application_id = a.id), '[]') AS instruments,
        a.created_at AS "createdAt", a.withdrawn_at AS "withdrawnAt"
      FROM announcement_applications a WHERE a.applicant_id = $1 ORDER BY a.created_at, a.id`,
  },
  {
    key: 'applicationsReceived', sql: `
      SELECT a.id, a.announcement_id AS "announcementId", a.status, a.owner_note AS "yourNote", a.created_at AS "createdAt"
      FROM announcement_applications a JOIN announcements an ON an.id = a.announcement_id
      WHERE an.user_id = $1 AND a.status <> 'withdrawn' ORDER BY a.created_at, a.id`,
  },
  {
    key: 'organizationsCreated', sql: `
      SELECT id, kind, name, slug, bio, city, region, country, managed, is_deleted AS "isDeleted", created_at AS "createdAt"
      FROM organizations WHERE created_by = $1 ORDER BY created_at, id`,
  },
  {
    key: 'organizationMemberships', sql: `
      SELECT m.organization_id AS "organizationId", o.name AS "organizationName", m.role, m.status, m.title, m.permissions,
        m.joined_on AS "joinedOn", m.left_on AS "leftOn", m.created_at AS "createdAt"
      FROM organization_members m JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = $1 ORDER BY m.created_at`,
  },
  {
    key: 'organizationsFollowed', sql: `
      SELECT f.organization_id AS "organizationId", o.name AS "organizationName", f.created_at AS "followedAt"
      FROM organization_followers f JOIN organizations o ON o.id = f.organization_id WHERE f.user_id = $1 ORDER BY f.created_at`,
  },
  {
    key: 'organizationPostsWritten', sql: `
      SELECT id, organization_id AS "organizationId", title, body, url, published_at AS "publishedAt"
      FROM organization_posts WHERE author_id = $1 ORDER BY published_at, id`,
  },
  {
    key: 'organizationClaims', sql: `
      SELECT organization_id AS "organizationId", message, status, review_note AS "reviewNote", created_at AS "createdAt", reviewed_at AS "reviewedAt"
      FROM organization_claims WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'marketplaceListings', sql: `
      SELECT id, listing_type AS "type", category, subcategory, title, description, item_condition AS "condition", price_mode AS "priceMode",
        price_minor AS "priceMinor", currency, rate_unit AS "rateUnit", location_text AS "location", is_remote AS "isRemote",
        shipping_available AS "shipping", status, expires_at AS "expiresAt", removed_at AS "removedAt", created_at AS "createdAt"
      FROM marketplace_listings WHERE user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'marketplaceSavedListings', sql: `
      SELECT listing_id AS "listingId", created_at AS "savedAt" FROM marketplace_saved_listings WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'pointsBalance', single: true, sql: `
      SELECT balance, updated_at AS "updatedAt" FROM points_balances WHERE user_id = $1`,
  },
  {
    key: 'pointsLedger', sql: `
      SELECT id, delta, reason, balance_after AS "balanceAfter", note, created_at AS "createdAt"
      FROM points_ledger WHERE user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'promotions', sql: `
      SELECT id, kind, announcement_id AS "announcementId", place_label AS "place", radius_km AS "radiusKm",
        starts_at AS "startsAt", ends_at AS "endsAt", points_spent AS "pointsSpent", created_at AS "createdAt"
      FROM promotions WHERE user_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'inviteCode', single: true, sql: `
      SELECT code, created_at AS "createdAt" FROM referral_codes WHERE user_id = $1`,
  },
  {
    key: 'referralsMade', sql: `
      SELECT status, source, created_at AS "createdAt", rewarded_at AS "rewardedAt" FROM referrals WHERE inviter_id = $1 ORDER BY created_at`,
  },
  {
    key: 'referralReceived', single: true, sql: `
      SELECT status, source, created_at AS "createdAt", rewarded_at AS "rewardedAt" FROM referrals WHERE invitee_id = $1`,
  },
  {
    key: 'billingSubscriptions', sql: `
      SELECT id, customer_id AS "customerId", plan, status, current_period_end AS "currentPeriodEnd",
        cancel_at_period_end AS "cancelAtPeriodEnd", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM billing_subscriptions WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'billingCheckouts', sql: `
      SELECT id, product, pack_id AS "packId", points, status, created_at AS "createdAt", completed_at AS "completedAt"
      FROM billing_checkout_sessions WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'rewardedVideoViews', sql: `
      SELECT card_id AS "sponsoredCardId", status, points, started_at AS "startedAt", completed_at AS "completedAt"
      FROM rewarded_video_views WHERE user_id = $1 ORDER BY started_at`,
  },
  {
    key: 'sponsoredPreferences', single: true, sql: `
      SELECT hide_sponsored AS "hideSponsored", updated_at AS "updatedAt" FROM monetization_settings WHERE user_id = $1`,
  },
  {
    key: 'eventsCreated', sql: `
      SELECT id, title, description, event_type AS "type", status, visibility, starts_at AS "startsAt", ends_at AS "endsAt",
        timezone, address, capacity, tickets_sold AS "ticketsSold", owner_user_id = $1 AS "ownedByYou", created_at AS "createdAt"
      FROM events WHERE owner_user_id = $1 OR created_by = $1 ORDER BY created_at, id`,
  },
  {
    key: 'eventLineupEntries', sql: `
      SELECT event_id AS "eventId", role, position, set_starts_at AS "setStartsAt", set_ends_at AS "setEndsAt", created_at AS "createdAt"
      FROM event_lineup WHERE artist_user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'eventAttendance', sql: `
      SELECT event_id AS "eventId", status, show_on_profile AS "showOnProfile", created_at AS "createdAt", updated_at AS "updatedAt"
      FROM event_attendees WHERE user_id = $1 ORDER BY created_at`,
  },
  {
    key: 'eventReminders', sql: `
      SELECT event_id AS "eventId", offset_minutes AS "offsetMinutes", remind_at AS "remindAt", sent_at AS "sentAt"
      FROM event_reminders WHERE user_id = $1 ORDER BY remind_at`,
  },
  {
    key: 'eventPostsWritten', sql: `
      SELECT id, event_id AS "eventId", body, created_at AS "createdAt" FROM event_posts WHERE author_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'eventCommunicationsWritten', sql: `
      SELECT id, event_id AS "eventId", kind, body, automatic, created_at AS "createdAt"
      FROM event_communications WHERE author_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'organizationVerificationRequests', sql: `
      SELECT id, subject_id AS "organizationId", status, request_note AS "note", document_media_id IS NOT NULL AS "documentStored",
        review_note AS "reviewNote", created_at AS "createdAt", reviewed_at AS "reviewedAt"
      FROM verification_requests WHERE requested_by = $1 AND subject_type = 'organization' ORDER BY created_at, id`,
  },
  {
    key: 'calendarEntriesOwned', sql: `
      SELECT e.id, e.kind, e.title, e.starts_at AS "startsAt", e.ends_at AS "endsAt", e.time_zone AS "timeZone",
        pl.name AS "placeName", e.address, e.notes, e.status, e.created_at AS "createdAt", e.updated_at AS "updatedAt"
      FROM calendar_entries e LEFT JOIN places pl ON pl.id = e.place_id WHERE e.owner_id = $1 ORDER BY e.starts_at, e.id`,
  },
  {
    key: 'bandCalendarEntriesCreated', sql: `
      SELECT e.id, e.organization_id AS "organizationId", e.kind, e.title, e.starts_at AS "startsAt", e.ends_at AS "endsAt",
        e.time_zone AS "timeZone", e.address, e.notes, e.status, e.created_at AS "createdAt"
      FROM calendar_entries e WHERE e.created_by = $1 AND e.organization_id IS NOT NULL ORDER BY e.starts_at, e.id`,
  },
  {
    key: 'calendarResponses', sql: `
      SELECT entry_id AS "entryId", invited, response, responded_at AS "respondedAt", created_at AS "createdAt"
      FROM calendar_participants WHERE user_id = $1 ORDER BY created_at, entry_id`,
  },
  {
    key: 'calendarReminders', sql: `
      SELECT entry_id AS "entryId", offset_minutes AS "offsetMinutes", remind_at AS "remindAt", sent_at AS "sentAt"
      FROM calendar_reminders WHERE user_id = $1 ORDER BY remind_at, id`,
  },
  {
    key: 'calendarFeed', single: true, sql: `
      SELECT created_at AS "createdAt", last_used_at AS "lastUsedAt" FROM calendar_feed_tokens WHERE user_id = $1`,
  },
  {
    key: 'bandChatMemberships', sql: `
      SELECT organization_id AS "organizationId", joined_at AS "joinedAt", left_at AS "leftAt",
        NULLIF(read_at, '-infinity') AS "readAt"
      FROM band_chat_members WHERE user_id = $1 ORDER BY joined_at, id`,
  },
  {
    key: 'bandChatMessagesSent', sql: `
      SELECT bm.id, bm.organization_id AS "organizationId", bm.created_at AS "createdAt", bm.is_deleted AS "isDeleted",
        (SELECT COUNT(*) FROM band_chat_attachments ba WHERE ba.message_id = bm.id)::int AS "attachmentCount"
      FROM band_chat_messages bm WHERE bm.sender_id = $1 ORDER BY bm.created_at, bm.id`,
  },
  {
    key: 'reviewsWritten', sql: `
      SELECT id, subject_id AS "subjectId", stars, body, status, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM profile_reviews WHERE author_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'reviewsReceived', sql: `
      SELECT id, author_id AS "authorId", stars, body, status, created_at AS "createdAt", approved_at AS "approvedAt"
      FROM profile_reviews WHERE subject_id = $1 ORDER BY created_at, id`,
  },
  {
    key: 'profileRatingsGiven', sql: `
      SELECT subject_id AS "subjectId", stars, created_at AS "createdAt", updated_at AS "updatedAt"
      FROM profile_ratings WHERE rater_id = $1 ORDER BY created_at, subject_id`,
  },
  {
    key: 'profileRatingSummary', single: true, sql: `
      SELECT rating_count AS "count", CASE WHEN rating_count >= 3 THEN ROUND(star_total::numeric / rating_count, 1) END AS "average",
        published_at AS "publishedAt"
      FROM profile_rating_stats WHERE subject_id = $1`,
  },
  {
    key: 'projectInstruments', sql: `
      SELECT pr.id AS "projectId", pr.name AS "projectName", i.name AS "instrument", pi.created_at AS "createdAt"
      FROM project_instruments pi JOIN projects pr ON pr.id = pi.project_id JOIN profiles p ON p.id = pr.profile_id
      JOIN instruments i ON i.id = pi.instrument_id
      WHERE p.user_id = $1 ORDER BY pr.created_at, pr.id, i.name`,
  },
];
