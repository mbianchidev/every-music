-- Seed data for music genres

INSERT INTO genres (name, parent_genre_id) VALUES
-- Main genres
('Rock', NULL),
('Metal', NULL),
('Pop', NULL),
('Hip Hop', NULL),
('Electronic', NULL),
('Jazz', NULL),
('Blues', NULL),
('Classical', NULL),
('Country', NULL),
('Folk', NULL),
('R&B', NULL),
('Reggae', NULL),
('Punk', NULL),
('Alternative', NULL),
('Indie', NULL)
ON CONFLICT (name) DO NOTHING;

-- Get parent genre IDs for sub-genres
DO $$
DECLARE
    rock_id UUID;
    metal_id UUID;
    electronic_id UUID;
    jazz_id UUID;
    punk_id UUID;
BEGIN
    SELECT id INTO rock_id FROM genres WHERE name = 'Rock';
    SELECT id INTO metal_id FROM genres WHERE name = 'Metal';
    SELECT id INTO electronic_id FROM genres WHERE name = 'Electronic';
    SELECT id INTO jazz_id FROM genres WHERE name = 'Jazz';
    SELECT id INTO punk_id FROM genres WHERE name = 'Punk';

    -- Rock sub-genres
    INSERT INTO genres (name, parent_genre_id) VALUES
    ('Hard Rock', rock_id),
    ('Progressive Rock', rock_id),
    ('Psychedelic Rock', rock_id),
    ('Garage Rock', rock_id),
    ('Glam Rock', rock_id)
    ON CONFLICT (name) DO NOTHING;

    -- Metal sub-genres
    INSERT INTO genres (name, parent_genre_id) VALUES
    ('Heavy Metal', metal_id),
    ('Thrash Metal', metal_id),
    ('Death Metal', metal_id),
    ('Black Metal', metal_id),
    ('Doom Metal', metal_id),
    ('Power Metal', metal_id),
    ('Progressive Metal', metal_id),
    ('Metalcore', metal_id),
    ('Deathcore', metal_id)
    ON CONFLICT (name) DO NOTHING;

    -- Electronic sub-genres
    INSERT INTO genres (name, parent_genre_id) VALUES
    ('House', electronic_id),
    ('Techno', electronic_id),
    ('Trance', electronic_id),
    ('Dubstep', electronic_id),
    ('Drum and Bass', electronic_id),
    ('Ambient', electronic_id),
    ('IDM', electronic_id)
    ON CONFLICT (name) DO NOTHING;

    -- Jazz sub-genres
    INSERT INTO genres (name, parent_genre_id) VALUES
    ('Bebop', jazz_id),
    ('Swing', jazz_id),
    ('Fusion', jazz_id),
    ('Smooth Jazz', jazz_id),
    ('Free Jazz', jazz_id)
    ON CONFLICT (name) DO NOTHING;

    -- Punk sub-genres
    INSERT INTO genres (name, parent_genre_id) VALUES
    ('Hardcore Punk', punk_id),
    ('Pop Punk', punk_id),
    ('Skate Punk', punk_id),
    ('Post-Punk', punk_id)
    ON CONFLICT (name) DO NOTHING;
END $$;
