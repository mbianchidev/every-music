-- i18n-polish: instruments played in each musical project, chosen from the
-- instrument catalog. Rows follow their project and instrument on deletion.

CREATE TABLE IF NOT EXISTS project_instruments (
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    instrument_id UUID NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, instrument_id)
);
CREATE INDEX IF NOT EXISTS idx_project_instruments_instrument ON project_instruments(instrument_id);
