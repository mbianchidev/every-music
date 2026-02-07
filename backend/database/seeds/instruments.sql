-- Seed data for instruments

INSERT INTO instruments (name, category) VALUES
-- String instruments
('Acoustic Guitar', 'string'),
('Electric Guitar', 'string'),
('Bass Guitar', 'string'),
('Classical Guitar', 'string'),
('7-String Guitar', 'string'),
('8-String Guitar', 'string'),
('Violin', 'string'),
('Viola', 'string'),
('Cello', 'string'),
('Double Bass', 'string'),
('Ukulele', 'string'),
('Banjo', 'string'),
('Mandolin', 'string'),
('Harp', 'string'),

-- Wind instruments
('Flute', 'wind'),
('Clarinet', 'wind'),
('Oboe', 'wind'),
('Bassoon', 'wind'),
('Saxophone', 'wind'),
('Trumpet', 'wind'),
('Trombone', 'wind'),
('French Horn', 'wind'),
('Tuba', 'wind'),
('Harmonica', 'wind'),
('Recorder', 'wind'),

-- Percussion
('Drums', 'percussion'),
('Percussion', 'percussion'),
('Cajon', 'percussion'),
('Bongos', 'percussion'),
('Congas', 'percussion'),
('Timpani', 'percussion'),
('Xylophone', 'percussion'),
('Marimba', 'percussion'),
('Vibraphone', 'percussion'),
('Tambourine', 'percussion'),
('Cymbals', 'percussion'),

-- Keyboard
('Piano', 'keyboard'),
('Keyboard', 'keyboard'),
('Synthesizer', 'keyboard'),
('Organ', 'keyboard'),
('Accordion', 'keyboard'),
('Harpsichord', 'keyboard'),

-- Vocal
('Vocals', 'vocal'),
('Lead Vocals', 'vocal'),
('Backing Vocals', 'vocal'),
('Soprano', 'vocal'),
('Alto', 'vocal'),
('Tenor', 'vocal'),
('Baritone', 'vocal'),
('Bass', 'vocal'),

-- Electronic
('DJ', 'electronic'),
('Electronic Music Producer', 'electronic'),
('Turntables', 'electronic'),
('MIDI Controller', 'electronic'),
('Drum Machine', 'electronic'),
('Sampler', 'electronic')
ON CONFLICT (name) DO NOTHING;
