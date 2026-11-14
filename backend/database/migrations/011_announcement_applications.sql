-- w4-applications: in-app replies to announcements with an owner dashboard.
-- Withdrawn rows keep only routing metadata; the partial unique index allows
-- one active application per applicant and announcement. closed_at records
-- when the announcement stopped accepting replies and drives retention.

CREATE TABLE IF NOT EXISTS announcement_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL CHECK (length(message) <= 4000),
    links JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(links) = 'array'),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'shortlisted', 'accepted', 'declined', 'withdrawn')),
    owner_note TEXT CHECK (length(owner_note) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status_changed_at TIMESTAMPTZ,
    withdrawn_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CHECK (status = 'withdrawn' OR length(message) >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_active
    ON announcement_applications(announcement_id, applicant_id) WHERE status <> 'withdrawn';
CREATE INDEX IF NOT EXISTS idx_applications_announcement
    ON announcement_applications(announcement_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applicant
    ON announcement_applications(applicant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_applications_closed
    ON announcement_applications(closed_at) WHERE closed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS application_instruments (
    application_id UUID NOT NULL REFERENCES announcement_applications(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    PRIMARY KEY (application_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_application_instruments_instrument ON application_instruments(instrument_id);
