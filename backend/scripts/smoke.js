import 'dotenv/config';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;
const baseUrl = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080';
const email = `smoke-${Date.now()}@example.test`;
const password = 'Production1Ready';
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
let userId;

async function request(path, { method = 'GET', body, accessToken } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  return { response, payload };
}

try {
  const ready = await request('/health/ready');
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
    },
  });
  assert.equal(created.response.status, 201);
  const announcementId = created.payload.data.id;

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

  console.log('Full-stack smoke test passed');
} finally {
  if (userId) {
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  }
  await pool.end();
}
