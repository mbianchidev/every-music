-- w5-organizations: bands, venues, organizers, booking agencies and labels with
-- memberships, relations, releases, update feeds, follows and venue claims;
-- music-lover profiles; announcements published on behalf of an organization.

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('band', 'venue', 'organizer', 'booking_agency', 'label')),
    name VARCHAR(255) NOT NULL CHECK (length(btrim(name)) > 0),
    slug VARCHAR(80) UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    bio TEXT CHECK (length(bio) <= 5000),
    picture_url TEXT CHECK (length(picture_url) <= 2048),
    city VARCHAR(255),
    region VARCHAR(255),
    country VARCHAR(255),
    latitude DECIMAL(10, 8) CHECK (latitude BETWEEN -90 AND 90),
    longitude DECIMAL(11, 8) CHECK (longitude BETWEEN -180 AND 180),
    contact_email VARCHAR(320),
    contact_phone VARCHAR(50),
    work_with_us TEXT CHECK (length(work_with_us) <= 5000),
    venue_type TEXT CHECK (venue_type IN ('disco', 'venue', 'social_center', 'stadium', 'club', 'theater', 'other')),
    capacity INTEGER CHECK (capacity BETWEEN 1 AND 1000000),
    active_since SMALLINT CHECK (active_since BETWEEN 1800 AND 2200),
    active_until SMALLINT CHECK (active_until BETWEEN 1800 AND 2200),
    parking_info TEXT CHECK (length(parking_info) <= 2000),
    directions TEXT CHECK (length(directions) <= 2000),
    formed_year SMALLINT CHECK (formed_year BETWEEN 1800 AND 2200),
    open_to_tours BOOLEAN NOT NULL DEFAULT FALSE,
    open_to_live BOOLEAN NOT NULL DEFAULT FALSE,
    open_to_support_acts BOOLEAN NOT NULL DEFAULT FALSE,
    open_to_endorsements BOOLEAN NOT NULL DEFAULT FALSE,
    youtube_channel_id VARCHAR(24) CHECK (youtube_channel_id ~ '^UC[A-Za-z0-9_-]{22}$'),
    youtube_linked_at TIMESTAMPTZ,
    feed_checked_at TIMESTAMPTZ,
    managed BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (managed OR kind = 'venue'),
    CHECK (kind = 'venue' OR (venue_type IS NULL AND capacity IS NULL AND parking_info IS NULL AND directions IS NULL)),
    CHECK (kind = 'band' OR (formed_year IS NULL AND youtube_channel_id IS NULL AND NOT open_to_tours
        AND NOT open_to_live AND NOT open_to_support_acts AND NOT open_to_endorsements)),
    CHECK (active_until IS NULL OR active_since IS NULL OR active_until >= active_since)
);
CREATE INDEX IF NOT EXISTS idx_organizations_page ON organizations(kind, created_at DESC, id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_organizations_name_search ON organizations USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_organizations_location_search ON organizations USING gin (
    (COALESCE(city, '') || ' ' || COALESCE(region, '') || ' ' || COALESCE(country, '')) gin_trgm_ops
);
CREATE INDEX IF NOT EXISTS idx_organizations_creator ON organizations(created_by);
CREATE INDEX IF NOT EXISTS idx_organizations_feed ON organizations(feed_checked_at NULLS FIRST)
    WHERE youtube_channel_id IS NOT NULL AND is_deleted = FALSE;

CREATE TABLE IF NOT EXISTS organization_genres (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY(organization_id, genre_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_genres_search ON organization_genres(genre_id, organization_id);

CREATE TABLE IF NOT EXISTS organization_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'website', 'other')),
    url TEXT NOT NULL CHECK (length(url) <= 2048),
    position SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_organization_links_owner ON organization_links(organization_id, position);

CREATE TABLE IF NOT EXISTS organization_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    url TEXT NOT NULL CHECK (length(url) <= 2048),
    category TEXT NOT NULL CHECK (category IN ('inside', 'outside', 'gallery')),
    caption VARCHAR(200),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organization_photos_owner ON organization_photos(organization_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_organization_photos_url ON organization_photos(url);

CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'admin', 'member')),
    status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'declined', 'left', 'removed')),
    title VARCHAR(100),
    permissions TEXT[] NOT NULL DEFAULT '{}' CHECK (permissions <@ ARRAY[
        'manage_profile', 'manage_members', 'post_announcements', 'manage_calendar'
    ]::text[]),
    joined_on DATE,
    left_on DATE,
    invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (role <> 'leader' OR status IN ('active', 'left', 'removed')),
    CHECK (left_on IS NULL OR joined_on IS NULL OR left_on >= joined_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_current ON organization_members(organization_id, user_id)
    WHERE status IN ('invited', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_members_leader ON organization_members(organization_id)
    WHERE role = 'leader' AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON organization_members(user_id, status);

CREATE TABLE IF NOT EXISTS organization_followers (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_organization_followers_user ON organization_followers(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind TEXT NOT NULL CHECK (kind IN ('roster', 'label')),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    band_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'ended')),
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    responded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    CHECK (organization_id <> band_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_relations_current ON organization_relations(kind, organization_id, band_id)
    WHERE status IN ('pending', 'accepted');
CREATE INDEX IF NOT EXISTS idx_organization_relations_band ON organization_relations(band_id, status);

CREATE TABLE IF NOT EXISTS organization_similar (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    similar_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    position SMALLINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY(organization_id, similar_id),
    CHECK (organization_id <> similar_id)
);

CREATE TABLE IF NOT EXISTS organization_releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL CHECK (length(btrim(title)) > 0),
    release_type TEXT NOT NULL CHECK (release_type IN ('single', 'ep', 'lp', 'album')),
    release_date DATE,
    links JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_organization_releases_owner ON organization_releases(organization_id, release_date DESC NULLS LAST, id);

CREATE TABLE IF NOT EXISTS organization_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('manual', 'youtube', 'release')),
    external_id VARCHAR(64),
    title VARCHAR(255),
    body TEXT CHECK (length(body) <= 4000),
    url TEXT CHECK (length(url) <= 2048),
    author_id UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (source = 'manual' OR external_id IS NOT NULL),
    CHECK (title IS NOT NULL OR body IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_posts_external ON organization_posts(organization_id, source, external_id)
    WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organization_posts_page ON organization_posts(organization_id, published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS organization_claims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 2000),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT CHECK (length(review_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_claims_pending ON organization_claims(organization_id, user_id)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_organization_claims_queue ON organization_claims(status, created_at, id);

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_announcements_organization ON announcements(organization_id, created_at DESC)
    WHERE organization_id IS NOT NULL;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'artist'
    CHECK (account_kind IN ('artist', 'music_lover'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS follows_visible BOOLEAN NOT NULL DEFAULT TRUE;
