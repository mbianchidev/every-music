import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';
import sharp from 'sharp';

const { Pool } = pg;
const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080';
const email = `smoke-${Date.now()}@example.test`;
const password = 'Production1Ready';
if (!process.env.REALM_CONNECTION) {
  throw new Error('REALM_CONNECTION must explicitly target the isolated smoke-test database');
}
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION, connectionTimeoutMillis: 5000 });
let userId;

async function request(path, { method = 'GET', body, accessToken } = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json();
  return { response, payload };
}

try {
  const ready = await request(process.env.SMOKE_READINESS_URL || '/health/ready');
  assert.equal(ready.response.status, 200);
  assert.equal(ready.payload.status, 'ready');

  const registration = await request('/realm/auth/register', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(registration.response.status, 201);
  userId = registration.payload.data.userId;

  await pool.query(
    `UPDATE users
     SET email_verified = true,
         verification_token_hash = NULL,
         verification_token_expires = NULL
     WHERE id = $1`,
    [userId],
  );

  const login = await request('/realm/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  assert.equal(login.response.status, 200);
  const { accessToken, refreshToken } = login.payload.data;

  const refreshed = await request('/realm/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken },
  });
  assert.equal(refreshed.response.status, 200);
  assert.notEqual(refreshed.payload.data.accessToken, accessToken);
  assert.notEqual(refreshed.payload.data.refreshToken, refreshToken);
  const rotatedRefreshToken = refreshed.payload.data.refreshToken;

  const retriedRefresh = await request('/realm/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken },
  });
  assert.equal(retriedRefresh.response.status, 200);
  assert.equal(retriedRefresh.payload.data.refreshToken, rotatedRefreshToken);

  const image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#ff4f8b' } }).png().toBuffer();
  const upload = await request('/realm/media', {
    method: 'POST',
    accessToken: refreshed.payload.data.accessToken,
    body: { data: image.toString('base64'), mimeType: 'image/png', purpose: 'announcement' },
  });
  assert.equal(upload.response.status, 201);

  const created = await request('/realm/announcements/', {
    method: 'POST',
    accessToken: refreshed.payload.data.accessToken,
    body: {
      title: 'Production smoke test',
      description: 'Automated integration coverage for the announcement workflow.',
      city: 'Test City',
      isRemote: true,
      instrumentIds: [],
      genreIds: [],
      links: [],
      pictureUrl: upload.payload.data.url,
    },
  });
  assert.equal(created.response.status, 201);
  const announcementId = created.payload.data.id;
  const downloaded = await fetch(new URL(upload.payload.data.url, baseUrl), { signal: AbortSignal.timeout(10000) });
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get('content-type'), /image\/webp/);
  const metadata = await sharp(Buffer.from(await downloaded.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 80);

  const streamController = new AbortController();
  const streamTimeout = setTimeout(() => streamController.abort(), 10000);
  try {
    const stream = await fetch(`${baseUrl}/realm/events`, {
      headers: { Authorization: `Bearer ${refreshed.payload.data.accessToken}` },
      signal: streamController.signal,
    });
    assert.equal(stream.status, 200);
    assert.match(stream.headers.get('content-type'), /text\/event-stream/);
    const reader = stream.body.getReader();
    try {
      const { value, done } = await reader.read();
      assert.equal(done, false);
      assert.match(new TextDecoder().decode(value), /"type":"connected"/);
    } finally {
      await reader.cancel().catch(error => { if (error.name !== 'AbortError') throw error; });
      reader.releaseLock();
    }
  } finally {
    clearTimeout(streamTimeout);
    streamController.abort();
  }

  const updated = await request(`/realm/announcements/${announcementId}`, {
    method: 'PUT',
    accessToken: refreshed.payload.data.accessToken,
    body: {
      instrumentIds: [],
      genreIds: [],
      links: [],
    },
  });
  assert.equal(updated.response.status, 200);

  const saved = await request(`/realm/announcements/${announcementId}/save`, {
    method: 'POST',
    accessToken: refreshed.payload.data.accessToken,
  });
  assert.equal(saved.response.status, 200);

  const savedList = await request('/realm/announcements/saved', {
    accessToken: refreshed.payload.data.accessToken,
  });
  assert.equal(savedList.response.status, 200);
  assert.equal(savedList.payload.data.announcements.length, 1);

  const logout = await request('/realm/auth/logout', {
    method: 'POST',
    accessToken: refreshed.payload.data.accessToken,
    body: { refreshToken: rotatedRefreshToken },
  });
  assert.equal(logout.response.status, 200);

  const rejectedRefresh = await request('/realm/auth/refresh-token', {
    method: 'POST',
    body: { refreshToken: rotatedRefreshToken },
  });
  assert.equal(rejectedRefresh.response.status, 401);

  console.log('API/database/media/live-stream smoke test passed');
} finally {
  if (userId) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
  await pool.end();
}
