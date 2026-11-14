import { createRequire } from 'node:module';
import playwrightConfig from '../playwright.config.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { apiOrigin } from '../e2e/origins.js';
import { avatar, cover, gear, poster } from './artwork.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');

// Every account this generator creates uses this prefix on the reserved
// example.test domain, so cleanup can find leftovers of an interrupted run.
const EMAIL_PATTERN = 'docs-screenshots-%@example.test';
const email = key => `docs-screenshots-${key}@example.test`;

const serverEnv = playwrightConfig.webServer[0].env;
const cipher = new CipherEngine({ cipher: {
  primaryKey: serverEnv.CIPHER_PRIMARY_KEY, refreshKey: serverEnv.CIPHER_REFRESH_KEY,
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 120, refreshTokenDays: 1,
} });

export const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });

const people = [
  {
    key: 'lia', name: 'Lia Montenero', city: ['Milan', 'IT'], age: 31, open: true, premium: true,
    bio: 'Singer and keyboard player from Milan. I write warm, slightly melancholic indie-pop and love long rehearsal nights with good coffee. Currently finishing a record with Glass Harbor.',
    instruments: [['Vocals', 'professional', 14], ['Piano', 'advanced', 11], ['Synthesizer', 'intermediate', 5]],
    genres: ['Indie', 'Pop', 'R&B'],
    contacts: { telegramId: '@lia_montenero_demo', signal: 'lia.demo.01', websiteUrl: 'https://lia-montenero.example' },
    links: [['spotify', 'https://listen.example/lia-montenero'], ['bandcamp', 'https://lia-montenero.example/music'], ['youtube', 'https://video.example/@liamontenero'], ['instagram', 'https://photos.example/lia.montenero']],
  },
  {
    key: 'dario', name: 'Dario Brezza', city: ['Monza', 'IT'], age: 34, open: false,
    bio: 'Guitarist and band leader of Glass Harbor. Chorus pedals, big chords, and arrangements that leave room for the voice.',
    instruments: [['Electric Guitar', 'professional', 17], ['Acoustic Guitar', 'advanced', 15]], genres: ['Indie', 'Rock', 'Alternative'],
  },
  {
    key: 'noor', name: 'Noor Altavilla', city: ['Bergamo', 'IT'], age: 27, open: true,
    bio: 'Bass player with a soft spot for Motown lines and modern R&B. Reads charts, loves to improvise, and owns too many flatwound strings.',
    instruments: [['Bass Guitar', 'advanced', 9], ['Double Bass', 'intermediate', 4]], genres: ['R&B', 'Fusion', 'Indie'],
  },
  {
    key: 'jun', name: 'Jun Castellano', city: ['Como', 'IT'], age: 29, open: true,
    bio: 'Drummer for Glass Harbor and session player around Lake Como. Tight grooves, quiet dynamics, and a click track when the song needs it.',
    instruments: [['Drums', 'professional', 15], ['Percussion', 'advanced', 8]], genres: ['Indie', 'Rock', 'Progressive Metal'],
  },
  {
    key: 'ettore', name: 'Ettore Calvi', city: ['Brescia', 'IT'], age: 41, open: true,
    bio: 'Hammond and Rhodes player. Twenty years of blues bars, wedding gigs and studio sessions, still chasing the perfect drawbar setting.',
    instruments: [['Organ', 'professional', 22], ['Keyboard', 'advanced', 20]], genres: ['Blues', 'Jazz', 'Rock'],
  },
  {
    key: 'ada', name: 'Ada Quercia', city: ['Pavia', 'IT'], age: 25, open: true,
    bio: 'Cellist from the conservatory, now playing chamber folk and film-score inspired songs. Happy to arrange strings for your record.',
    instruments: [['Cello', 'professional', 16], ['Viola', 'intermediate', 6]], genres: ['Classical', 'Folk', 'Ambient'],
  },
  {
    key: 'teo', name: 'Teo Rinaldi', city: ['Milan', 'IT'], age: 30, open: true,
    bio: 'Producer and synth nerd behind Neon Orchard. Modular patches by night, pop hooks by day.',
    instruments: [['Electronic Music Producer', 'professional', 10], ['Synthesizer', 'advanced', 10], ['Drum Machine', 'advanced', 7]], genres: ['Electronic', 'Pop', 'House'],
  },
  {
    key: 'sofia', name: 'Sofia Lanterna', city: ['Turin', 'IT'], age: 33, open: false,
    bio: 'Tenor sax player and singer in Lanterna Rossa, a soul covers band that plays every wedding and club in Piedmont.',
    instruments: [['Saxophone', 'professional', 18], ['Backing Vocals', 'advanced', 12]], genres: ['R&B', 'Jazz', 'Swing'],
  },
  {
    key: 'femke', name: 'Femke Rosendaal', city: ['Amsterdam', 'NL'], age: 28, open: true,
    bio: 'Violinist and folk fiddler. I play canal-side sessions in Amsterdam and tour small festivals every summer.',
    instruments: [['Violin', 'professional', 20], ['Mandolin', 'intermediate', 4]], genres: ['Folk', 'Country', 'Classical'],
  },
  {
    key: 'pim', name: 'Pim Verhoeven', city: ['Rotterdam', 'NL'], age: 32, open: true,
    bio: 'Drummer and DJ from Rotterdam. Post-punk energy on stage, warm vinyl sets after midnight. Plays with Saltwater Static.',
    instruments: [['Drums', 'advanced', 12], ['DJ', 'intermediate', 6]], genres: ['Post-Punk', 'Electronic', 'Garage Rock'],
  },
  {
    key: 'marit', name: 'Marit van Dalen', city: ['Utrecht', 'NL'], age: 26, open: true,
    bio: 'Singer-songwriter with a 12-string and a notebook full of harmonies. Looking for people to sing with.',
    instruments: [['Lead Vocals', 'advanced', 10], ['Acoustic Guitar', 'intermediate', 7]], genres: ['Folk', 'Pop', 'Indie'],
  },
  {
    key: 'bruno', name: 'Bruno Ferraguti', city: ['Bologna', 'IT'], age: 45, open: false,
    bio: 'Double bass player who runs the Sunday jazz sessions in Bologna. Bebop by heart, swing by default.',
    instruments: [['Double Bass', 'professional', 25]], genres: ['Jazz', 'Bebop', 'Swing'],
  },
  {
    key: 'carla', name: 'Carla Benvenuti', city: ['Florence', 'IT'], age: 35, open: true,
    bio: 'Trumpet player in a ska-reggae horn section. Offbeats, sunshine, and a lot of ear plugs.',
    instruments: [['Trumpet', 'advanced', 16], ['Trombone', 'intermediate', 5]], genres: ['Reggae', 'Punk', 'Swing'],
  },
  {
    key: 'marta', name: 'Marta Fontana', city: ['Piacenza', 'IT'], age: 38, open: false, kind: 'music_lover',
    bio: 'I book concerts for Night Owls Promotions and run Riverside Hall. Always listening for the next band to put on stage.',
    instruments: [], genres: ['Indie', 'Electronic', 'Rock'],
  },
  {
    key: 'rosa', name: 'Rosa Bellini', city: ['Genoa', 'IT'], age: 24, open: false, kind: 'music_lover',
    bio: 'Music lover, concert regular and vinyl collector. Front row whenever Glass Harbor plays.',
    instruments: [], genres: ['Indie', 'Pop', 'Folk'],
  },
  {
    key: 'giulia', name: 'Giulia Serra', city: ['Bologna', 'IT'], age: 29, open: false, kind: 'music_lover', locale: 'it',
    bio: 'Appassionata di musica dal vivo e di jazz. Vado a tutti i concerti della domenica.',
    instruments: [], genres: ['Jazz', 'Indie'],
  },
  {
    key: 'promo', name: 'Promo Blast 3000', city: ['Rotterdam', 'NL'], age: null, open: false,
    bio: 'Followers fast and cheap. Message me for a deal.',
    instruments: [], genres: [],
  },
  {
    key: 'admin', name: 'Moderation Team', city: ['Amsterdam', 'NL'], age: null, open: false, role: 'admin', kind: 'music_lover',
    bio: 'Every.music moderators. We review reports, verification requests and help desk tickets.',
    instruments: [], genres: [],
  },
];

const calls = [
  {
    owner: 'lia', title: 'Drummer for an indie-pop band in Milan', city: ['Milan', 'IT'], instruments: ['Drums'], genres: ['Indie', 'Pop'], daysAgo: 1,
    description: 'Our indie-pop band is recording a second record this winter and we need a drummer who can play quietly and still lift a chorus. Two rehearsals a week near Porta Romana, a handful of club shows in spring. Bring your own sticks and ideas.',
  },
  {
    owner: 'dario', organization: 'glass', title: 'Glass Harbor is looking for a bass player', city: ['Monza', 'IT'], instruments: ['Bass Guitar'], genres: ['Indie', 'Rock'], daysAgo: 2,
    description: 'Glass Harbor needs a bassist for the album release show and a short tour in March. Melodic lines, good timing, and a love for big guitar-driven songs. The band rehearses on Tuesdays in Monza and shares the drive to every gig.',
  },
  {
    owner: 'noor', title: 'Keys player for a funk and R&B band', city: ['Bergamo', 'IT'], instruments: ['Keyboard', 'Organ'], genres: ['R&B', 'Fusion'], daysAgo: 3,
    description: 'We are a five-piece band playing original funk and modern R&B. Looking for someone comfortable with clavinet sounds, pads and a bit of soloing. Weekly rehearsal in Bergamo, studio days in January.',
  },
  {
    owner: 'ada', title: 'Strings for a chamber-folk EP', city: ['Pavia', 'IT'], instruments: ['Violin', 'Viola'], genres: ['Folk', 'Classical'], daysAgo: 4, remote: true,
    description: 'I am arranging strings for a five-song chamber-folk EP and need a violin and a viola player. Parts are written, recording can happen in Pavia or remotely from your home setup.',
  },
  {
    owner: 'ettore', title: 'Cercasi organista Hammond per una band blues', city: ['Brescia', 'IT'], instruments: ['Organ'], genres: ['Blues', 'Rock'], daysAgo: 5,
    description: 'La nostra band blues suona due venerdì al mese in provincia di Brescia e cerca un secondo tastierista per i concerti più grandi. Shuffle, slow blues e qualche classico soul. In sala prove c\'è già un Leslie.',
  },
  {
    owner: 'sofia', organization: 'lanterna', title: 'Trumpet for a soul covers band', city: ['Turin', 'IT'], instruments: ['Trumpet'], genres: ['R&B', 'Swing'], daysAgo: 6, cover: true,
    description: 'Lanterna Rossa is a nine-piece soul covers band with a busy wedding and club calendar. We need a trumpet player to complete the horn section. Charts are ready, paid gigs from February.',
  },
  {
    owner: 'teo', organization: 'neon', title: 'Vocalist to co-write an electronic EP', city: ['Milan', 'IT'], instruments: ['Vocals'], genres: ['Electronic', 'Pop'], daysAgo: 7, remote: true,
    description: 'Neon Orchard has six instrumental demos waiting for a voice. Looking for a singer who writes their own toplines and enjoys dreamy synth-pop. Sessions in Milan or remote, credits and royalties shared fairly.',
  },
  {
    owner: 'jun', title: 'Guitarist for a progressive metal band', city: ['Como', 'IT'], instruments: ['7-String Guitar', 'Electric Guitar'], genres: ['Progressive Metal', 'Metal'], daysAgo: 8,
    description: 'Instrumental progressive metal band near Como looking for a second guitarist. Odd meters, clean ambient sections and heavy riffs. Demos are on our page, rehearsals every Saturday afternoon.',
  },
  {
    owner: 'bruno', title: 'Pianista per le jam session jazz della domenica', city: ['Bologna', 'IT'], instruments: ['Piano'], genres: ['Jazz', 'Bebop'], daysAgo: 9,
    description: 'La jam session della domenica a Bologna cerca un pianista fisso. Standard, qualche brano originale e un pubblico affezionato. Suoniamo dalle 18 alle 21 e ogni settimana cambiano i solisti.',
  },
  {
    owner: 'carla', title: 'Batterista per una band ska-reggae', city: ['Florence', 'IT'], instruments: ['Drums'], genres: ['Reggae', 'Punk'], daysAgo: 10,
    description: 'La nostra band ska-reggae suona ai festival estivi in Toscana e cerca un batterista che ami il levare e il one-drop. Prove a Firenze, furgone e backline inclusi.',
  },
  {
    owner: 'femke', title: 'Accordion or mandolin for folk festival sets', city: ['Amsterdam', 'NL'], instruments: ['Accordion', 'Mandolin'], genres: ['Folk', 'Country'], daysAgo: 4,
    description: 'Our folk trio plays small festivals in the Netherlands and Belgium every summer. We would love an accordion or mandolin player to join for a few sets and maybe a recording session.',
  },
  {
    owner: 'pim', organization: 'saltwater', title: 'Second guitarist for a post-punk band', city: ['Rotterdam', 'NL'], instruments: ['Electric Guitar'], genres: ['Post-Punk', 'Garage Rock'], daysAgo: 6,
    description: 'Saltwater Static is adding a second guitar for louder shows. Angular riffs, lots of delay, short songs. Rehearsals in Rotterdam-West, first gig already booked.',
  },
  {
    owner: 'marit', title: 'Harmony vocals for an acoustic duo', city: ['Utrecht', 'NL'], instruments: ['Backing Vocals'], genres: ['Folk', 'Pop'], daysAgo: 11, remote: true,
    description: 'I write quiet folk-pop songs and want a second voice for close harmonies. Living-room shows in Utrecht and a few online sessions. Remote demos are welcome.',
  },
];

const organizations = [
  {
    key: 'glass', kind: 'band', leader: 'dario', title: 'Guitar', name: 'Glass Harbor', slug: 'glass-harbor-demo', city: ['Monza', 'IT'],
    bio: 'Glass Harbor is a four-piece indie band from Monza and Milan. Shimmering guitars, warm keys and songs about leaving and coming home. Our second album, Tidal Lines, is out this season.',
    genres: ['Indie', 'Rock', 'Alternative'], formedYear: 2019, openTo: { tours: true, live: true, supportActs: true, endorsements: false },
    links: [['website', 'https://glass-harbor.example'], ['bandcamp', 'https://glass-harbor.example/music'], ['instagram', 'https://photos.example/glassharbor']],
    since: '2019-03-01',
    members: [['lia', 'Vocals and keys', '2019-03-01', ['post_announcements', 'manage_calendar']], ['jun', 'Drums', '2020-09-15'], ['ettore', 'Hammond and keys', '2023-01-10']],
  },
  {
    key: 'neon', kind: 'band', leader: 'teo', title: 'Synths and production', name: 'Neon Orchard', slug: 'neon-orchard-demo', city: ['Milan', 'IT'],
    bio: 'Dreamy synth-pop from Milan. Analog arpeggios, drum machines and a lot of reverb.',
    genres: ['Electronic', 'Pop', 'Indie'], formedYear: 2021, openTo: { live: true, supportActs: true }, members: [],
  },
  {
    key: 'saltwater', kind: 'band', leader: 'pim', title: 'Drums', name: 'Saltwater Static', slug: 'saltwater-static-demo', city: ['Rotterdam', 'NL'],
    bio: 'Post-punk trio from Rotterdam. Fast songs, loud amps, harbour views.',
    genres: ['Post-Punk', 'Garage Rock', 'Indie'], formedYear: 2020, openTo: { tours: true, live: true }, members: [],
  },
  {
    key: 'lanterna', kind: 'band', leader: 'sofia', title: 'Tenor sax', name: 'Lanterna Rossa', slug: 'lanterna-rossa-demo', city: ['Turin', 'IT'],
    bio: 'Nine-piece soul and Motown covers band from Turin with a full horn section.',
    genres: ['R&B', 'Swing', 'Pop'], formedYear: 2016, openTo: { live: true }, members: [],
  },
  {
    key: 'riverside', kind: 'venue', leader: 'marta', title: 'Programming', name: 'Riverside Hall', slug: 'riverside-hall-demo', city: ['Milan', 'IT'],
    bio: 'A converted tram depot on the canal with a 800-person main room and a small bar stage for new bands.',
    venueType: 'venue', capacity: 800, parkingInfo: 'Bike racks at the entrance, paid parking two streets away.', directions: 'Tram stop "Canal Depot", then follow the river path for 200 m.',
    genres: ['Indie', 'Electronic', 'Rock'], members: [],
  },
  {
    key: 'owls', kind: 'organizer', leader: 'marta', title: 'Booker', name: 'Night Owls Promotions', slug: 'night-owls-demo', city: ['Milan', 'IT'],
    bio: 'Independent promoters putting on indie and electronic nights across Lombardy since 2015.', genres: ['Indie', 'Electronic'], members: [],
  },
  {
    key: 'tidepool', kind: 'label', leader: 'teo', title: 'Founder', name: 'Tidepool Records', slug: 'tidepool-records-demo', city: ['Milan', 'IT'],
    bio: 'Small independent label for indie and electronic records, vinyl first.', genres: ['Indie', 'Electronic'], members: [],
  },
];

const listings = [
  { owner: 'dario', type: 'sell', category: 'guitars', subcategory: 'acoustic_guitar', condition: 'used', price: 65000, currency: 'EUR', city: 'Monza', shipping: true, art: 'guitar',
    title: 'Honey-finish acoustic guitar with pickup', description: 'Solid spruce top, warm and balanced, with a built-in pickup for small stages. Recently set up, comes with a padded gig bag. Small finish wear on the back.' },
  { owner: 'ettore', type: 'sell', category: 'amplifiers', subcategory: 'guitar_amp', condition: 'used', price: 42000, currency: 'EUR', city: 'Brescia', art: 'amp',
    title: '30 W tube combo amp with reverb', description: 'Two-channel tube combo with spring reverb and footswitch. Valves replaced last year. Pick-up preferred, can meet halfway.' },
  { owner: 'jun', type: 'sell', category: 'drums_percussion', subcategory: 'acoustic_drums', condition: 'used', price: 78000, currency: 'EUR', city: 'Como', art: 'drums',
    title: 'Five-piece birch drum kit with hardware', description: 'Birch shells, 22" kick, two rack toms and a floor tom, double-braced hardware and a throne. Cymbals not included.' },
  { owner: 'teo', type: 'sell', category: 'keyboards', subcategory: 'synthesizer', condition: 'refurbished', price: 115000, currency: 'EUR', city: 'Milan', shipping: true, art: 'synth',
    title: 'Analog polysynth, recently serviced', description: 'Six-voice analog polysynth, fully serviced with new key contacts. Includes the original power supply and a hard case.' },
  { owner: 'femke', type: 'wanted', category: 'keyboards', subcategory: 'digital_piano', priceMode: 'negotiable', price: 50000, currency: 'EUR', city: 'Amsterdam', art: 'keys',
    title: 'Wanted: 73-key stage piano', description: 'Looking for a light stage piano with weighted keys for rehearsals and small gigs. Happy to collect around Amsterdam.' },
  { owner: 'lia', type: 'sell', category: 'studio', subcategory: 'microphone', condition: 'new', price: 18000, currency: 'EUR', city: 'Milan', shipping: true, art: 'mic',
    title: 'Large-diaphragm condenser microphone', description: 'Bought for a home studio, used for two sessions. Includes shock mount, pop filter and the original box.' },
  { owner: 'pim', type: 'service_offer', category: 'driver', priceMode: 'fixed', price: 22000, currency: 'EUR', rateUnit: 'day', city: 'Rotterdam', remote: false, art: 'van',
    title: 'Tour van and driver for Benelux dates', description: 'Nine-seat van with room for backline. Experienced tour driver, flexible hours, invoices available.' },
  { owner: 'bruno', type: 'lesson', category: 'instrument_lessons', subcategory: 'bass', priceMode: 'fixed', price: 3500, currency: 'EUR', rateUnit: 'hour', city: 'Bologna', remote: true, art: 'desk',
    title: 'Jazz bass lessons, all levels', description: 'Walking lines, reading, and ear training for electric and double bass. In person in Bologna or online.' },
];

export const state = { people: {}, places: {}, calls: {}, organizations: {}, events: {}, listings: {}, entries: {} };

async function call(actor, method, path, body) {
  const response = await fetch(`${apiOrigin}/realm${path}`, {
    method,
    headers: {
      ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload?.error ?? payload)}`);
  }
  return payload.data;
}

async function upload(actor, purpose, image) {
  return call(actor, 'POST', '/media', { purpose, mimeType: 'image/png', data: (await image).toString('base64') });
}

function localDate(daysFromNow, time) {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 10)}T${time}`;
}

async function place([name, country]) {
  const key = `${name}:${country}`;
  if (!state.places[key]) {
    const { places } = await call(null, 'GET', `/catalog/places?q=${encodeURIComponent(name)}&country=${country}&limit=5`);
    state.places[key] = places.find(item => item.name === name) ?? places[0];
  }
  return state.places[key];
}

export async function cleanup() {
  const { rows } = await pool.query('SELECT id FROM users WHERE email LIKE $1', [EMAIL_PATTERN]);
  const ids = rows.map(row => row.id);
  if (!ids.length) return;
  await pool.query('DELETE FROM events WHERE created_by = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM calendar_entries WHERE created_by = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM organizations WHERE created_by = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM sponsored_cards WHERE created_by = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM support_requests WHERE user_id = ANY($1::uuid[]) OR contact_email LIKE $2', [ids, EMAIL_PATTERN]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

// A real refresh session issued with the browser API's synthetic keys, so the
// generator never spends the per-IP sign-in limit.
export async function storeSession(person) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  return {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  };
}

async function catalogs() {
  const { instruments } = await call(null, 'GET', '/catalog/instruments');
  const { genres } = await call(null, 'GET', '/catalog/genres');
  const lookup = (list, label) => name => {
    const item = list.find(entry => entry.name === name);
    if (!item) throw new Error(`Unknown ${label} ${name}`);
    return item.id;
  };
  return { instrument: lookup(instruments, 'instrument'), genre: lookup(genres, 'genre') };
}

async function createPeople(catalog) {
  for (const person of people) {
    const { rows: [user] } = await pool.query(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email(person.key), person.role ?? 'member'],
    );
    await pool.query('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [user.id, person.name]);
    if (person.locale) await pool.query('INSERT INTO user_preferences (user_id, locale) VALUES ($1, $2)', [user.id, person.locale]);
    const actor = { ...person, id: user.id, email: email(person.key) };
    actor.token = cipher.createAccessToken(actor.id, actor.email);
    state.people[person.key] = actor;
  }
  for (const person of people) {
    const actor = state.people[person.key];
    const location = await place(person.city);
    const picture = person.key === 'promo' ? null : await upload(actor, 'profile', avatar(person.key));
    actor.pictureUrl = picture?.url ?? null;
    await call(actor, 'PUT', '/profiles/me', {
      artistName: person.name, bio: person.bio, age: person.age, placeId: location.id,
      accountKind: person.kind ?? 'artist', openToProjects: person.open,
      profilePictureUrl: picture?.url ?? null, contactVisibility: 'members',
      ...(person.contacts ?? {}),
      links: (person.links ?? []).map(([linkType, url]) => ({ linkType, url })),
      instruments: person.instruments.map(([name, skillLevel, yearsExperience]) => ({ instrumentId: catalog.instrument(name), skillLevel, yearsExperience })),
      genreIds: person.genres.map(catalog.genre),
    });
  }
  const admin = state.people.admin;
  for (const person of people.filter(item => item.premium)) {
    await call(admin, 'POST', `/admin/users/${state.people[person.key].id}/entitlements`, { plan: 'premium', days: 365 });
  }
  await call(admin, 'POST', `/admin/users/${state.people.marta.id}/entitlements`, { plan: 'partner', days: 365 });
  for (const [index, person] of Object.values(state.people).entries()) {
    await pool.query("UPDATE profiles SET created_at = NOW() - $2 * INTERVAL '1 day' WHERE user_id = $1", [person.id, 20 + index * 17]);
  }
}

async function createOrganizations(catalog) {
  const p = state.people;
  for (const organization of organizations) {
    const leader = p[organization.leader];
    const location = await place(organization.city);
    const picture = await upload(leader, 'organization', cover(`organization:${organization.key}`, { width: 640, height: 640 }));
    const created = await call(leader, 'POST', '/organizations', {
      kind: organization.kind, name: organization.name, slug: organization.slug, bio: organization.bio, title: organization.title,
      city: location.name, region: location.region, country: location.country, latitude: location.latitude, longitude: location.longitude,
      genreIds: organization.genres.map(catalog.genre), pictureUrl: picture.url,
      ...(organization.links ? { links: organization.links.map(([linkType, url]) => ({ linkType, url })) } : {}),
      ...(organization.kind === 'band' ? { formedYear: organization.formedYear, openTo: organization.openTo } : {}),
      ...(organization.kind === 'venue' ? {
        venueType: organization.venueType, capacity: organization.capacity, parkingInfo: organization.parkingInfo, directions: organization.directions,
      } : {}),
    });
    state.organizations[organization.key] = created;
    const id = state.organizations[organization.key].id;
    if (organization.since) await call(leader, 'PATCH', `/organizations/${id}/members/${leader.id}`, { joinedOn: organization.since });
    for (const [key, title, joinedOn, permissions] of organization.members) {
      await call(leader, 'POST', `/organizations/${id}/members`, { userId: p[key].id, title, ...(permissions ? { permissions } : {}) });
      await call(p[key], 'PATCH', `/organizations/${id}/invitation`, { response: 'accept' });
      await call(leader, 'PATCH', `/organizations/${id}/members/${p[key].id}`, { joinedOn });
    }
  }
  const o = state.organizations;
  const glass = o.glass.id;
  const releases = [['Paper Moons', 'ep', -420], ['Northern Static', 'single', -140], ['Tidal Lines', 'album', -20]];
  for (const [title, releaseType, days] of releases) {
    await call(p.dario, 'POST', `/organizations/${glass}/releases`, {
      title, releaseType, releaseDate: localDate(days, '00:00').slice(0, 10),
      links: [{ linkType: 'bandcamp', url: `https://glass-harbor.example/music/${title.toLowerCase().replace(/[^a-z]+/g, '-')}` }],
    });
  }
  await call(p.dario, 'POST', `/organizations/${glass}/posts`, {
    title: 'Release show tickets are on sale', body: 'We are celebrating Tidal Lines at Riverside Hall with Neon Orchard. Early tickets went fast, the second batch is online now.',
  });
  await call(p.lia, 'POST', `/organizations/${glass}/posts`, {
    title: 'Back in the studio', body: 'Three new songs are taking shape. Thank you to everyone who came to the listening session last week.',
  });
  // Release updates are dated like the releases, manual updates a few days ago.
  await pool.query(`UPDATE organization_posts p SET published_at = r.release_date + TIME '10:00', created_at = r.release_date + TIME '10:00'
    FROM organization_releases r WHERE p.organization_id = $1 AND p.source = 'release' AND p.external_id = r.id::text`, [glass]);
  await pool.query(`UPDATE organization_posts SET published_at = NOW() - CASE WHEN title LIKE 'Back%' THEN INTERVAL '6 days' ELSE INTERVAL '2 days' END
    WHERE organization_id = $1 AND source = 'manual'`, [glass]);
  for (const [key, photo] of [['glass', 'gallery'], ['riverside', 'inside'], ['riverside', 'outside']]) {
    const leader = p[organizations.find(item => item.key === key).leader];
    const image = await upload(leader, 'organization', cover(`photo:${key}:${photo}`));
    await call(leader, 'POST', `/organizations/${o[key].id}/photos`, { url: image.url, category: photo, caption: photo === 'gallery' ? 'Rehearsal room, autumn session' : undefined });
  }
  await call(p.dario, 'PUT', `/organizations/${glass}/similar`, { bandIds: [o.neon.id, o.saltwater.id] });
  const relation = await call(p.teo, 'POST', `/organizations/${o.tidepool.id}/relations`, { bandId: glass });
  await call(p.dario, 'PATCH', `/organizations/${glass}/relations/${relation.id}`, { response: 'accept' });
  for (const key of ['rosa', 'noor', 'femke', 'marit', 'giulia', 'marta']) await call(p[key], 'POST', `/organizations/${glass}/follow`);
  for (const key of ['rosa', 'lia']) await call(p[key], 'POST', `/organizations/${o.neon.id}/follow`);
  for (const key of ['glass', 'riverside', 'owls']) await call(p.admin, 'PUT', `/admin/organizations/${o[key].id}/verification`, { verified: true });
  const document = await upload(p.pim, 'verification', cover('verification:saltwater-document', { width: 800, height: 1000 }));
  await call(p.pim, 'POST', `/organizations/${o.saltwater.id}/verification-request`, {
    note: 'Our official website saltwater-static.example lists this page in the footer, next to our booking contact.', documentMediaId: document.id,
  });
}

async function createCalls(catalog) {
  const p = state.people;
  for (const [index, item] of calls.entries()) {
    const owner = p[item.owner];
    const location = await place(item.city);
    const picture = await upload(owner, 'announcement', cover(`call:${index}`));
    const created = await call(owner, 'POST', '/announcements', {
      title: item.title, description: item.description, placeId: location.id, isRemote: Boolean(item.remote), isCoverBand: Boolean(item.cover),
      instrumentIds: item.instruments.map(catalog.instrument), genreIds: item.genres.map(catalog.genre), pictureUrl: picture.url,
      isPublished: true, ...(item.organization ? { organizationId: state.organizations[item.organization].id } : {}),
      links: [{ linkType: 'website', url: `https://demo-${index}.example/listen` }],
    });
    state.calls[index] = created;
    await pool.query("UPDATE announcements SET created_at = NOW() - $2 * INTERVAL '1 day' - $3 * INTERVAL '1 hour' WHERE id = $1",
      [state.calls[index].id, item.daysAgo, index]);
  }
}

async function createApplications(catalog) {
  const p = state.people;
  const target = state.calls[0].id;
  const applicants = [
    ['carla', 'I mostly play trumpet, but I also drum in a ska band and would love to try something calmer. Links to live videos below.', 'declined', 'Lovely player, but we need someone full time.'],
    ['teo', 'I can program electronic drums and play pads live. Could be fun for the more synth-heavy songs.', 'accepted', 'Perfect for the two electronic tracks. Send the stems.'],
    ['pim', 'Rotterdam-based but in Milan twice a month for studio work. Happy to record drums remotely for the album and join the spring shows.', 'sent', null],
    ['jun', 'Hi Lia! I play in Glass Harbor with Dario, so I already know a few of your songs. I love dynamic indie-pop and I am free on Tuesday and Thursday evenings.', 'shortlisted', 'Great feel on the demo. Invite to the rehearsal on the 28th.'],
  ];
  for (const [key, message, status, note] of applicants) {
    const instrumentIds = key === 'teo' ? [] : [catalog.instrument('Drums')];
    const application = await call(p[key], 'POST', `/announcements/${target}/applications`, {
      message, instrumentIds, links: [{ linkType: 'soundcloud', url: `https://audio.example/${key}/live-session` }, { linkType: 'website', url: `https://${key}-drums.example` }],
    });
    if (status !== 'sent' || note) await call(p.lia, 'PATCH', `/applications/${application.id}`, { ...(status !== 'sent' ? { status } : {}), ...(note ? { ownerNote: note } : {}) });
  }
  await pool.query(`UPDATE announcement_applications a SET created_at = NOW() - ranked.position * INTERVAL '26 hours'
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS position FROM announcement_applications WHERE announcement_id = $1) ranked
    WHERE a.id = ranked.id`, [target]);
  await call(p.marit, 'POST', `/announcements/${state.calls[6].id}/applications`, {
    message: 'I write my own toplines and would love to try a dreamy synth-pop record.', instrumentIds: [catalog.instrument('Vocals')], links: [],
  });
}

async function createProjects(catalog) {
  const p = state.people;
  await call(p.lia, 'POST', '/profiles/me/projects', {
    name: 'Lia Montenero (solo)', role: 'Songwriter', yearsActive: '2016-present',
    description: 'Piano ballads and quiet electronic songs, released one single a season.',
    collaborators: [{ userId: p.teo.id, role: 'Production' }, { userId: p.ada.id, role: 'Cello' }],
    instrumentIds: [catalog.instrument('Piano'), catalog.instrument('Vocals')],
  });
  await call(p.lia, 'POST', '/profiles/me/projects', {
    name: 'Glass Harbor', role: 'Vocals and keys', yearsActive: '2019-present',
    description: 'Indie band from Monza and Milan. I write most of the lyrics and play the synth parts on the new album.',
    websiteLink: 'https://glass-harbor.example', bandcampLink: 'https://glass-harbor.example/music',
    collaborators: [{ userId: p.dario.id, role: 'Guitar' }, { userId: p.jun.id, role: 'Drums' }],
    instrumentIds: [catalog.instrument('Vocals'), catalog.instrument('Synthesizer'), catalog.instrument('Piano')],
  });
}

async function createSocial() {
  const p = state.people;
  for (const [from, to] of [
    ['dario', 'lia'], ['lia', 'dario'], ['jun', 'lia'], ['lia', 'jun'], ['teo', 'lia'], ['lia', 'teo'], ['rosa', 'lia'], ['noor', 'lia'],
    ['femke', 'lia'], ['marit', 'lia'], ['ada', 'lia'], ['lia', 'ada'], ['giulia', 'lia'], ['rosa', 'dario'], ['rosa', 'teo'], ['rosa', 'jun'],
  ]) await call(p[from], 'POST', `/profiles/${p[to].id}/follow`);
  const reviews = [
    ['dario', 5, 'Lia hears the whole arrangement before anyone plays a note. Every session with her ends with a better song than we started with.'],
    ['teo', 5, 'Brilliant toplines, always on time, and generous with ideas. Working on her solo single was a joy.'],
    ['ada', 4, 'Clear charts and a calm studio. She knew exactly what the cello should do on every bar.'],
  ];
  for (const [key, stars, body] of reviews) {
    const review = await call(p[key], 'PUT', `/profiles/${p.lia.id}/review`, { stars, body });
    await call(p.lia, 'PATCH', `/reviews/${review.id}`, { status: 'approved' });
  }
  await pool.query(`UPDATE profile_reviews r SET created_at = dated.at, updated_at = dated.at, approved_at = dated.at + INTERVAL '5 hours'
    FROM (SELECT id, NOW() - CASE author_id WHEN $2::uuid THEN INTERVAL '41 days' WHEN $3::uuid THEN INTERVAL '12 days' ELSE INTERVAL '3 days' END AS at
      FROM profile_reviews WHERE subject_id = $1) dated WHERE r.id = dated.id`, [p.lia.id, p.dario.id, p.teo.id]);
  const raters = ['dario', 'jun', 'teo', 'rosa', 'noor', 'femke', 'marit', 'ada', 'giulia'];
  const stars = [5, 5, 4, 5, 4, 5, 5, 4, 5];
  for (const [index, key] of raters.entries()) await call(p[key], 'PUT', `/profiles/${p.lia.id}/rating`, { stars: stars[index] });
  // Ratings are republished by a daily job; publish the snapshot now.
  await pool.query(`INSERT INTO profile_rating_stats (subject_id, rating_count, star_total) VALUES ($1, $2, $3)
    ON CONFLICT (subject_id) DO UPDATE SET rating_count = EXCLUDED.rating_count, star_total = EXCLUDED.star_total`,
  [p.lia.id, stars.length, stars.reduce((sum, value) => sum + value, 0)]);

  const verify = async (key, decide) => {
    const { challengeCode } = await call(p[key], 'GET', '/verification/me');
    const selfie = await upload(p[key], 'verification', avatar(`verification:${key}`));
    const request = await call(p[key], 'POST', '/verification/requests', { challengeCode, selfieMediaId: selfie.id });
    if (decide) {
      await call(p.admin, 'PATCH', `/admin/verification-requests/${request.id}`, {
        decision: 'approve', note: 'The code and the profile pictures match. Welcome to the verified artists.',
      });
    }
  };
  await verify('lia', true);
  await verify('teo', true);
  await verify('ettore', false);

  await call(p.dario, 'POST', '/reports', {
    reportedUserId: p.promo.id, category: 'spam', consent: true,
    details: 'Sends the same "buy followers" message to everyone in our band and comments it under our call.',
  });
  await call(p.femke, 'POST', '/reports', {
    reportedUserId: p.promo.id, category: 'fake_profile', consent: true,
    details: 'This profile claims to be a booking agency but links to a follower shop.',
  });
  await call(p.dario, 'POST', '/support', {
    kind: 'bug', subject: 'Calendar reminder arrived twice', message: 'I got two reminders for our Tuesday rehearsal on my phone. It only happened once.',
    steps: 'Set a 1 hour reminder on a band rehearsal, then edit the address.',
  });
  await call(p.femke, 'POST', '/support', {
    kind: 'contact', subject: 'Question about festival pages', message: 'Can a folk festival have its own organizer page with several stages?',
  });
  await call(p.marit, 'POST', '/support', {
    kind: 'work', subject: 'Volunteer translator for Dutch', message: 'I would love to help review the Dutch translation of the app.',
  });
  await pool.query(`UPDATE support_requests SET created_at = NOW() - CASE kind WHEN 'bug' THEN INTERVAL '3 days' WHEN 'contact' THEN INTERVAL '2 days'
    ELSE INTERVAL '5 hours' END WHERE user_id = ANY($1::uuid[])`, [[p.dario.id, p.femke.id, p.marit.id]]);
}

async function createEvents(catalog) {
  const p = state.people;
  const o = state.organizations;
  const definitions = [
    {
      key: 'release', creator: 'marta', title: 'Glass Harbor: Tidal Lines release show', type: 'concert', days: 12, start: '20:30', doors: '19:30', end: '23:30',
      timezone: 'Europe/Rome', venueId: o.riverside.id, organizerIds: [o.owls.id], capacity: 800, ticketsSold: 612, genres: ['Indie', 'Rock'],
      description: 'Glass Harbor celebrate their second album with a full live show, strings and all. Neon Orchard opens the night with a dreamy synth set, and the bar stage stays open until late.',
      lineup: [
        { role: 'headliner', bandId: o.glass.id, setStartsAt: '21:30' }, { role: 'opener', bandId: o.neon.id, setStartsAt: '20:30' },
        { role: 'support', artistId: p.ada.id, setStartsAt: '21:10' }, { role: 'other', name: 'Late DJ set: Night Owls residents', setStartsAt: '23:00' },
      ],
      tickets: [['Riverside Hall box office', 'https://tickets.example/riverside/tidal-lines'], ['Night Owls online shop', 'https://night-owls.example/tickets']],
    },
    {
      key: 'harbor', creator: 'pim', title: 'Harbour Lights Weekender', type: 'festival', days: 26, start: '15:00', end: '23:59', timezone: 'Europe/Amsterdam',
      city: ['Rotterdam', 'NL'], address: 'Pier 7, Maashaven', capacity: 2500, ticketsSold: 940, genres: ['Post-Punk', 'Indie'], organizerIds: [o.saltwater.id],
      description: 'Two stages on the pier: post-punk, garage rock and soul from Rotterdam, Turin and beyond.',
      lineup: [{ role: 'headliner', bandId: o.saltwater.id }, { role: 'headliner', bandId: o.lanterna.id }, { role: 'support', artistId: p.femke.id }],
      tickets: [['Weekender tickets', 'https://tickets.example/harbour-lights']],
    },
    {
      key: 'jazz', creator: 'bruno', title: 'Sunday Jazz Session at the Cloister', type: 'concert', days: 5, start: '18:00', end: '21:00', timezone: 'Europe/Rome',
      city: ['Bologna', 'IT'], address: 'Cloister courtyard, Via delle Arti', capacity: 120, ticketsSold: 64, genres: ['Jazz', 'Bebop'],
      description: 'Standards, originals and an open jam for the last hour. Bring your instrument.',
      lineup: [{ role: 'headliner', artistId: p.bruno.id }, { role: 'other', name: 'Open jam' }],
      tickets: [],
    },
    {
      key: 'neon', creator: 'teo', title: 'Neon Orchard: live synth session', type: 'concert', days: 19, start: '21:00', end: '23:00', timezone: 'Europe/Rome',
      venueId: o.riverside.id, organizerIds: [o.neon.id], capacity: 150, ticketsSold: 150, genres: ['Electronic', 'Pop'],
      description: 'An intimate seated show on the bar stage with modular synths, drum machines and visuals.',
      lineup: [{ role: 'headliner', bandId: o.neon.id }], tickets: [['Bar stage tickets', 'https://tickets.example/neon-orchard']],
    },
    {
      key: 'folk', creator: 'femke', title: 'Canal-side folk evening', type: 'concert', days: 33, start: '19:30', end: '22:30', timezone: 'Europe/Amsterdam',
      city: ['Amsterdam', 'NL'], address: 'Houseboat stage, Prinsengracht', capacity: 80, ticketsSold: 22, genres: ['Folk', 'Country'],
      description: 'Fiddle tunes, harmonies and stories on a houseboat. Small crowd, warm tea.',
      lineup: [{ role: 'headliner', artistId: p.femke.id }, { role: 'support', artistId: p.marit.id }], tickets: [],
    },
    {
      key: 'soul', creator: 'sofia', title: 'Lanterna Rossa: Motown night', type: 'concert', days: 40, start: '22:00', end: '01:30', timezone: 'Europe/Rome',
      city: ['Turin', 'IT'], address: 'Ex Fabbrica, Via Po', capacity: 400, ticketsSold: 120, genres: ['R&B', 'Swing'], organizerIds: [o.lanterna.id],
      description: 'Three sets of soul and Motown classics with a full horn section. Dancing shoes required.',
      lineup: [{ role: 'headliner', bandId: o.lanterna.id }], tickets: [['Club tickets', 'https://tickets.example/motown-night']],
    },
  ];
  for (const event of definitions) {
    const creator = p[event.creator];
    const image = await upload(creator, 'event', poster(`event:${event.key}`));
    const date = localDate(event.days, event.start).slice(0, 10);
    const at = time => (time ? `${date}T${time}` : undefined);
    const endsAt = event.end && event.end < event.start ? `${localDate(event.days + 1, event.end)}` : at(event.end);
    const created = await call(creator, 'POST', '/gigs', {
      title: event.title, description: event.description, type: event.type, timezone: event.timezone,
      startsAt: at(event.start), endsAt, ...(event.doors ? { doorsOpenAt: at(event.doors) } : {}),
      ...(event.venueId ? { venueId: event.venueId } : { placeId: (await place(event.city)).id, address: event.address }),
      capacity: event.capacity, ticketsSold: event.ticketsSold,
      ticketLinks: event.tickets.map(([label, url]) => ({ label, url })),
      images: [image.url], genreIds: event.genres.map(catalog.genre),
      ...(event.organizerIds ? { organizerIds: event.organizerIds } : {}),
      lineup: event.lineup.map(entry => ({ ...entry, ...(entry.setStartsAt ? { setStartsAt: `${date}T${entry.setStartsAt}` } : {}) })),
      visibility: 'published',
    });
    state.events[event.key] = created;
  }
  const release = state.events.release.id;
  for (const [key, status] of [['rosa', 'going'], ['lia', 'going'], ['noor', 'interested'], ['femke', 'interested'], ['giulia', 'going'], ['marit', 'going']]) {
    await call(p[key], 'PUT', `/gigs/${release}/attendance`, { status });
  }
  await call(p.rosa, 'PUT', `/gigs/${release}/reminders`, { offsets: [1440, 60] });
  await call(p.marta, 'POST', `/gigs/${release}/communications`, {
    kind: 'door_open', body: 'Doors open at 19:30. The cloakroom is free and the bar stage starts with a short acoustic set by Ada Quercia.',
  });
  await call(p.rosa, 'POST', `/gigs/${release}/posts`, { body: 'Anyone coming from Genoa by train? Happy to meet at the station and walk together.' });
  await call(p.giulia, 'POST', `/gigs/${release}/posts`, { body: 'First time at Riverside Hall. Is there a coat check?' });
  await call(p.marta, 'POST', `/gigs/${release}/posts`, { body: 'Yes, free coat check next to the entrance, and the bar takes cards.' });
  await pool.query(`UPDATE event_posts SET created_at = NOW() - ranked.position * INTERVAL '9 hours'
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS position FROM event_posts WHERE event_id = $1) ranked
    WHERE event_posts.id = ranked.id`, [release]);
  await pool.query("UPDATE event_communications SET created_at = NOW() - INTERVAL '2 days' WHERE event_id = $1", [release]);
  for (const [key, events] of [['rosa', ['jazz', 'neon']], ['giulia', ['jazz']], ['noor', ['neon', 'harbor']], ['femke', ['harbor']]]) {
    for (const event of events) await call(p[key], 'PUT', `/gigs/${state.events[event].id}/attendance`, { status: 'going' });
  }
}

async function createCalendar() {
  const p = state.people;
  const glass = state.organizations.glass.id;
  const monza = await place(['Monza', 'IT']);
  const milan = await place(['Milan', 'IT']);
  const entries = [
    { key: 'rehearsal1', kind: 'rehearsal', title: 'Full band rehearsal', days: 2, start: '19:00', end: '22:00', place: monza, address: 'Sala Prove 42, Via dei Mulini 8',
      notes: 'Run the release show set twice. Ettore brings the Leslie.' },
    { key: 'recording', kind: 'recording', title: 'Strings overdubs for "Low Tide"', days: 4, start: '10:00', end: '17:00', place: milan, address: 'Studio Canale, Via Ripa 21',
      notes: 'Ada records cello, Noor joins for the double bass part.', invitees: ['noor', 'ada'] },
    { key: 'meeting', kind: 'meeting', title: 'Tour planning call', days: 6, start: '18:30', end: '19:30', place: null, address: null, notes: 'Agree on the March dates and merch budget.' },
    { key: 'rehearsal2', kind: 'rehearsal', title: 'Full band rehearsal', days: 9, start: '19:00', end: '22:00', place: monza, address: 'Sala Prove 42, Via dei Mulini 8', notes: 'Dress rehearsal with in-ear monitors.' },
    { key: 'gig', kind: 'gig', title: 'Tidal Lines release show', days: 12, start: '17:00', end: '23:59', place: milan, address: 'Riverside Hall', notes: 'Load-in at 17:00, soundcheck at 18:00.' },
  ];
  for (const entry of entries) {
    const created = await call(p.dario, 'POST', '/calendar/entries', {
      kind: entry.kind, title: entry.title, organizationId: glass, timeZone: 'Europe/Rome',
      startLocal: localDate(entry.days, entry.start), endLocal: localDate(entry.days, entry.end),
      placeId: entry.place?.id ?? null, address: entry.address ?? undefined, notes: entry.notes,
      inviteeIds: (entry.invitees ?? []).map(key => p[key].id), reminderOffsets: [60],
    });
    state.entries[entry.key] = created;
  }
  for (const entry of Object.values(state.entries)) await call(p.dario, 'PUT', `/calendar/entries/${entry.id}/response`, { response: 'yes' });
  for (const [key, response] of [['lia', 'yes'], ['jun', 'yes'], ['ettore', 'maybe']]) {
    await call(p[key], 'PUT', `/calendar/entries/${state.entries.rehearsal1.id}/response`, { response });
  }
  for (const [key, response] of [['noor', 'yes'], ['ada', 'yes'], ['lia', 'yes']]) {
    await call(p[key], 'PUT', `/calendar/entries/${state.entries.recording.id}/response`, { response });
  }
  await call(p.dario, 'POST', '/calendar/entries', {
    kind: 'other', title: 'Guitar lesson with a student', timeZone: 'Europe/Rome',
    startLocal: localDate(3, '16:00'), endLocal: localDate(3, '17:00'), placeId: monza.id, notes: 'Bring the capo and the new pedal.',
  });
}

async function createListings(catalog) {
  const p = state.people;
  for (const [index, item] of listings.entries()) {
    const owner = p[item.owner];
    const first = await upload(owner, 'listing', gear(item.art, `listing:${index}`));
    const second = await upload(owner, 'listing', gear(item.art, `listing:${index}:detail`));
    const created = await call(owner, 'POST', '/marketplace/listings', {
      type: item.type, category: item.category, ...(item.subcategory ? { subcategory: item.subcategory } : {}),
      title: item.title, description: item.description, ...(item.condition ? { condition: item.condition } : {}),
      priceMode: item.priceMode ?? 'fixed', priceMinor: item.price, currency: item.currency,
      ...(item.rateUnit ? { rateUnit: item.rateUnit } : {}), locationText: item.city,
      remote: Boolean(item.remote), ...(['sell', 'wanted'].includes(item.type) ? { shipping: Boolean(item.shipping) } : {}),
      photos: [first.url, second.url],
    });
    state.listings[index] = created;
    await pool.query("UPDATE marketplace_listings SET created_at = NOW() - $2 * INTERVAL '5 hour' WHERE id = $1", [state.listings[index].id, index]);
  }
  await call(p.noor, 'POST', `/marketplace/listings/${state.listings[0].id}/save`);
}

async function createMonetization() {
  const p = state.people;
  for (const [key, points, note] of [['noor', 750, 'Welcome bonus for the winter festival'], ['lia', 1200, 'Thanks for hosting the songwriting meetup']]) {
    await call(p.admin, 'POST', '/admin/points/grants', { email: p[key].email, points, note });
  }
  await call(p.lia, 'POST', '/points/spend', { kind: 'announcement_boost', days: 3, announcementId: state.calls[0].id });
  await call(p.noor, 'POST', '/ratings', { appVersion: '1.0.0', stars: 5, comment: 'Found my funk band here in a week.', platform: 'web' });
  await call(p.noor, 'POST', '/points/spend', { kind: 'profile_boost', days: 3 });
  const amsterdam = await place(['Amsterdam', 'NL']);
  const image = await upload(p.admin, 'sponsored', cover('sponsored:strings', { width: 960, height: 540 }));
  await call(p.admin, 'POST', '/admin/sponsored-cards', {
    sponsorName: 'Corda & Co. Strings', title: 'Meet the luthiers behind our new strings', body: 'A two-minute visit to a small string workshop. Watch to the end to earn points.',
    linkUrl: 'https://corda-strings.example', linkLabel: 'Visit the workshop', imageUrl: image.url, imageAlt: 'Abstract orange and teal waves',
    videoUrl: 'https://media.example/corda-workshop.mp4', videoSeconds: 30, rewardPoints: 10,
    placements: ['musicians'], placeId: amsterdam.id, radiusKm: 5, priority: 10, maxPerPage: 1, active: true,
  });
}

async function createNotifications() {
  const p = state.people;
  await call(p.dario, 'POST', `/profiles/${p.noor.id}/follow`);
  await call(p.lia, 'POST', `/profiles/${p.noor.id}/follow`);
  await call(p.noor, 'POST', `/announcements/${state.calls[1].id}/save`);
  // Spread the generated notifications over the last days and mark the older ones read.
  await pool.query(`UPDATE notifications n SET created_at = NOW() - ranked.position * INTERVAL '5 hours',
      read_at = CASE WHEN ranked.position > 4 THEN NOW() ELSE NULL END
    FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC, id) AS position FROM notifications WHERE user_id = $1) ranked
    WHERE n.id = ranked.id`, [p.noor.id]);
}

export async function seed() {
  await cleanup();
  const catalog = await catalogs();
  await createPeople(catalog);
  await createOrganizations(catalog);
  await createCalls(catalog);
  await createApplications(catalog);
  await createProjects(catalog);
  await createSocial();
  await createEvents(catalog);
  await createCalendar();
  await createListings(catalog);
  await createMonetization();
  await createNotifications();
  return state;
}
