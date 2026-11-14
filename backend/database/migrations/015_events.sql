-- w8-events: concerts and festivals with lineups, organizers, venues, tickets,
-- capacity, attendance, reminders, attendee discussion, official
-- communications, event reports and organization verification requests.

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 160),
    description TEXT CHECK (length(description) <= 10000),
    event_type TEXT NOT NULL DEFAULT 'concert' CHECK (event_type IN ('concert', 'festival', 'other')),
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'postponed', 'cancelled')),
    visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('draft', 'published')),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ,
    doors_open_at TIMESTAMPTZ,
    timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 64),
    venue_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
    address TEXT CHECK (length(address) <= 300),
    latitude DOUBLE PRECISION CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK (longitude BETWEEN -180 AND 180),
    capacity INTEGER CHECK (capacity BETWEEN 1 AND 10000000),
    tickets_sold INTEGER NOT NULL DEFAULT 0 CHECK (tickets_sold >= 0),
    owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    revision INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (ends_at IS NULL OR ends_at > starts_at),
    CHECK (doors_open_at IS NULL OR doors_open_at <= starts_at),
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
    CHECK (capacity IS NULL OR tickets_sold <= capacity),
    CHECK (capacity IS NOT NULL OR tickets_sold = 0)
);
CREATE INDEX IF NOT EXISTS idx_events_published_start ON events(starts_at, id) WHERE visibility = 'published';
CREATE INDEX IF NOT EXISTS idx_events_owner ON events(owner_user_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_creator ON events(created_by);
CREATE INDEX IF NOT EXISTS idx_events_venue ON events(venue_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_events_place ON events(place_id);
CREATE INDEX IF NOT EXISTS idx_events_location ON events(latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_title_search ON events USING gin (title gin_trgm_ops);

CREATE TABLE IF NOT EXISTS event_organizers (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL DEFAULT 0 CHECK (position BETWEEN 0 AND 9),
    PRIMARY KEY (event_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_event_organizers_organization ON event_organizers(organization_id);

CREATE TABLE IF NOT EXISTS event_lineup (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 99),
    role TEXT NOT NULL CHECK (role IN ('headliner', 'opener', 'support', 'other')),
    band_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    artist_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(160) CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    set_starts_at TIMESTAMPTZ,
    set_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (num_nonnulls(band_id, artist_user_id, name) = 1),
    CHECK (set_ends_at IS NULL OR set_starts_at IS NULL OR set_ends_at > set_starts_at)
);
CREATE INDEX IF NOT EXISTS idx_event_lineup_event ON event_lineup(event_id, position);
CREATE INDEX IF NOT EXISTS idx_event_lineup_band ON event_lineup(band_id) WHERE band_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_event_lineup_artist ON event_lineup(artist_user_id) WHERE artist_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_genres (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (event_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_event_genres_genre ON event_genres(genre_id);

CREATE TABLE IF NOT EXISTS event_images (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 5),
    PRIMARY KEY (event_id, media_id),
    UNIQUE (event_id, position)
);
CREATE INDEX IF NOT EXISTS idx_event_images_url ON event_images(('/realm/media/' || media_id::text));

CREATE TABLE IF NOT EXISTS event_ticket_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    label VARCHAR(80) NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
    url TEXT NOT NULL CHECK (length(url) <= 2048 AND url ~ '^https://'),
    position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4)
);
CREATE INDEX IF NOT EXISTS idx_event_ticket_links_event ON event_ticket_links(event_id, position);

CREATE TABLE IF NOT EXISTS event_attendees (
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('going', 'interested')),
    show_on_profile BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id, status);

CREATE TABLE IF NOT EXISTS event_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    offset_minutes INTEGER NOT NULL CHECK (offset_minutes BETWEEN 5 AND 20160),
    remind_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, user_id, offset_minutes)
);
CREATE INDEX IF NOT EXISTS idx_event_reminders_due ON event_reminders(remind_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_reminders_user ON event_reminders(user_id);

CREATE TABLE IF NOT EXISTS event_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_posts_page ON event_posts(event_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_event_posts_author ON event_posts(author_id);

CREATE TABLE IF NOT EXISTS event_communications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('door_open', 'cancellation', 'refund', 'lineup_change', 'postponement', 'general')),
    body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_communications_event ON event_communications(event_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_event_communications_author ON event_communications(author_id);

ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE user_reports ADD COLUMN IF NOT EXISTS event_post_id UUID REFERENCES event_posts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_event ON user_reports(event_id, status) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_reports_event_post ON user_reports(event_post_id) WHERE event_post_id IS NOT NULL;

ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_subject_type_check;
ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_subject_type_check CHECK (subject_type IN ('user', 'organization'));
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS request_note TEXT CHECK (length(request_note) <= 2000);
