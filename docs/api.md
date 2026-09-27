# API reference

Local base URL: `http://localhost:8080`.

Authenticated requests use:

```http
Authorization: Bearer <access-token>
```

Success:

```json
{
  "success": true,
  "data": {}
}
```

Failure:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": []
  }
}
```

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/health/live` | Process liveness |
| GET | `/health/ready` | PostgreSQL readiness |
| GET | `/pulse` | Readiness compatibility alias |
| GET | `/nexus-info` | Version and environment |

## Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/realm/auth/register` | Create an email account |
| POST | `/realm/auth/login` | Create a session |
| POST | `/realm/auth/login/google` | Create a Google session |
| GET | `/realm/auth/verify-email?token=...` | Verify an email address |
| POST | `/realm/auth/resend-verification` | Request a new verification email |
| POST | `/realm/auth/refresh-token` | Refresh the access token |
| POST | `/realm/auth/password-reset/initiate` | Request a reset link |
| POST | `/realm/auth/password-reset/complete` | Set a new password |
| POST | `/realm/auth/logout` | Revoke a refresh session |

Registration requires a password with at least eight characters, uppercase, lowercase, and a number. Email accounts must be verified before login.

Refresh:

```json
{
  "refreshToken": "<refresh-token>"
}
```

Logout accepts the same body. Password reset revokes all active refresh sessions.

## Profiles

| Method | Path | Authentication |
|---|---|---|
| GET | `/realm/profiles/me` | Required |
| PUT | `/realm/profiles/me` | Required |
| GET | `/realm/profiles/search` | Public |
| GET | `/realm/profiles/:profileId` | Public |
| POST | `/realm/profiles/me/projects` | Required |
| DELETE | `/realm/profiles/me/projects/:projectId` | Required |

Search pagination accepts `page` and `pageSize`; `pageSize` is limited to 100.

## Announcements

| Method | Path | Authentication |
|---|---|---|
| POST | `/realm/announcements/` | Required |
| GET | `/realm/announcements/search` | Optional |
| GET | `/realm/announcements/me` | Required |
| GET | `/realm/announcements/saved` | Required |
| GET | `/realm/announcements/:announcementId` | Optional |
| PUT | `/realm/announcements/:announcementId` | Required |
| DELETE | `/realm/announcements/:announcementId` | Required |
| POST | `/realm/announcements/:announcementId/react` | Required |
| POST | `/realm/announcements/:announcementId/save` | Required |
| DELETE | `/realm/announcements/:announcementId/save` | Required |

Announcement titles are 5–255 characters and descriptions are 20–5000 characters.

For relation fields on update:

- omitted field: preserve current values
- empty array: clear all values
- populated array: replace the set

## Catalog

| Method | Path | Description |
|---|---|---|
| GET | `/realm/catalog/instruments` | Instruments grouped by category |
| GET | `/realm/catalog/genres` | Genres and parent genres |
