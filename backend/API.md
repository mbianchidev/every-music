# Every.music API - Quick Reference

## Base URL
```
Development: http://localhost:8080
Production: https://api.everymusic.com
```

## Authentication

Include access token in header:
```
Authorization: Bearer <access-token>
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Description",
    "details": []
  }
}
```

## Endpoints Summary

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| **Health & Info** |
| GET | `/pulse` | No | Health check |
| GET | `/nexus-info` | No | API information |
| **Authentication** |
| POST | `/realm/auth/register` | No | Register with email |
| POST | `/realm/auth/login` | No | Login with email |
| POST | `/realm/auth/login/google` | No | Login with Google |
| GET | `/realm/auth/verify-email` | No | Verify email |
| POST | `/realm/auth/refresh-token` | No | Refresh access token |
| POST | `/realm/auth/password-reset/initiate` | No | Request password reset |
| POST | `/realm/auth/password-reset/complete` | No | Complete password reset |
| POST | `/realm/auth/logout` | No | Logout |
| **Profiles** |
| GET | `/realm/profiles/me` | Yes | Get my profile |
| PUT | `/realm/profiles/me` | Yes | Update my profile |
| GET | `/realm/profiles/search` | No | Search profiles |
| GET | `/realm/profiles/:profileId` | No | Get profile by ID |
| POST | `/realm/profiles/me/projects` | Yes | Add project |
| DELETE | `/realm/profiles/me/projects/:projectId` | Yes | Remove project |
| **Announcements** |
| POST | `/realm/announcements/` | Yes | Create announcement |
| GET | `/realm/announcements/search` | No | Search announcements |
| GET | `/realm/announcements/me` | Yes | My announcements |
| GET | `/realm/announcements/saved` | Yes | Saved announcements |
| GET | `/realm/announcements/:id` | No | Get announcement |
| PUT | `/realm/announcements/:id` | Yes | Update announcement |
| DELETE | `/realm/announcements/:id` | Yes | Delete announcement |
| POST | `/realm/announcements/:id/react` | Yes | React (like/dislike) |
| POST | `/realm/announcements/:id/save` | Yes | Save announcement |
| DELETE | `/realm/announcements/:id/save` | Yes | Unsave announcement |
| **Catalog** |
| GET | `/realm/catalog/instruments` | No | List instruments |
| GET | `/realm/catalog/genres` | No | List genres |

## Common Examples

### 1. Complete Registration Flow

```bash
# Step 1: Register
curl -X POST http://localhost:8080/realm/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'

# Step 2: Verify email (check inbox for token)
curl http://localhost:8080/realm/auth/verify-email?token=<verification-token>

# Step 3: Login
curl -X POST http://localhost:8080/realm/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }'
# Save accessToken and refreshToken from response
```

### 2. Update Profile with Instruments

```bash
# Get available instruments first
curl http://localhost:8080/realm/catalog/instruments

# Update profile
curl -X PUT http://localhost:8080/realm/profiles/me \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{
    "artistName": "John Rocker",
    "firstName": "John",
    "lastName": "Doe",
    "age": 28,
    "city": "Los Angeles",
    "bio": "Professional guitarist with 10 years experience",
    "instruments": [
      {
        "instrumentId": "<electric-guitar-id>",
        "yearsExperience": 10,
        "skillLevel": "professional"
      }
    ],
    "genreIds": ["<rock-id>", "<metal-id>"]
  }'
```

### 3. Create and Search Announcements

```bash
# Create announcement
curl -X POST http://localhost:8080/realm/announcements/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{
    "title": "Looking for a bassist",
    "description": "Progressive metal band seeking experienced bassist for upcoming tour",
    "city": "Los Angeles",
    "isRemote": false,
    "isCoverBand": false,
    "instrumentIds": ["<bass-guitar-id>"],
    "genreIds": ["<progressive-metal-id>"]
  }'

# Search announcements
curl "http://localhost:8080/realm/announcements/search?city=Los%20Angeles&instrumentId=<bass-guitar-id>&page=1&pageSize=10"

# React to announcement
curl -X POST http://localhost:8080/realm/announcements/<announcement-id>/react \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{"reactionType": "like"}'

# Save announcement
curl -X POST http://localhost:8080/realm/announcements/<announcement-id>/save \
  -H "Authorization: Bearer <access-token>"
```

### 4. Token Refresh

```bash
# When access token expires
curl -X POST http://localhost:8080/realm/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "<refresh-token>"
  }'
# Use new tokens from response
```

## Data Models

### Profile Object
```javascript
{
  id: "uuid",
  userId: "uuid",
  artistName: "string",
  firstName: "string",
  lastName: "string",
  age: number,
  city: "string",
  state: "string",
  country: "string",
  location: {
    latitude: number,
    longitude: number
  },
  bio: "string",
  profilePictureUrl: "string",
  contacts: {
    phone: "string",
    telegramId: "string",
    whatsapp: "string",
    signal: "string",
    websiteUrl: "string"
  },
  instruments: [
    {
      instrument_id: "uuid",
      name: "string",
      category: "string",
      years_experience: number,
      skill_level: "beginner|intermediate|advanced|professional"
    }
  ],
  genres: [
    {
      genre_id: "uuid",
      name: "string"
    }
  ],
  projects: [...]
}
```

### Announcement Object
```javascript
{
  id: "uuid",
  userId: "uuid",
  title: "string",
  description: "string",
  pictureUrl: "string",
  location: {
    city: "string",
    state: "string",
    country: "string",
    coordinates: {
      latitude: number,
      longitude: number
    }
  },
  isRemote: boolean,
  isCoverBand: boolean,
  instruments: [...],
  genres: [...],
  links: [
    {
      link_type: "spotify|youtube|soundcloud|bandcamp|website|other",
      url: "string"
    }
  ],
  stats: {
    views: number,
    likes: number,
    dislikes: number
  },
  expiresAt: "ISO8601",
  isPublished: boolean,
  createdAt: "ISO8601",
  updatedAt: "ISO8601"
}
```

## Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request / Validation Error
- `401` - Unauthorized / Authentication Required
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict (e.g., email already exists)
- `429` - Too Many Requests
- `500` - Internal Server Error
- `503` - Service Unavailable

## Rate Limiting

- **Default**: 150 requests per 15 minutes per IP
- **On exceed**: 429 status with retry-after information

## Pagination

Query parameters for list endpoints:
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20, max: 100)

Response includes:
```json
{
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "hasMore": true
  }
}
```

## Validation Rules

### Email
- Valid email format
- Unique in system

### Password
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### Age
- Between 13 and 120

### URLs
- Valid URL format

### Coordinates
- Latitude: -90 to 90
- Longitude: -180 to 180

## Error Codes Reference

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Input validation failed |
| `MISSING_CREDENTIALS` | No authentication provided |
| `INVALID_TOKEN` | Token invalid or expired |
| `UNAUTHORIZED` | Not authorized for resource |
| `NOT_FOUND` | Resource not found |
| `EMAIL_TAKEN` | Email already registered |
| `INVALID_CREDENTIALS` | Wrong email/password |
| `ACCOUNT_DISABLED` | Account has been disabled |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `GOOGLE_LOGIN_FAILED` | Google authentication failed |
| `PROFILE_NOT_FOUND` | Profile not found |
| `ANNOUNCEMENT_NOT_FOUND` | Announcement not found |

## Environment Setup

Required environment variables:
```bash
REALM_CONNECTION=postgresql://user:pass@host:5432/dbname
CIPHER_PRIMARY_KEY=<64-char-random-string>
CIPHER_REFRESH_KEY=<64-char-random-string>
```

Optional:
```bash
PORTAL_ORIGIN=http://localhost:3000
GOOGLE_IDENTITY_KEY=<google-client-id>
GOOGLE_IDENTITY_LOCK=<google-client-secret>
MAIL_GATEWAY=smtp.gmail.com
MAIL_IDENTITY=<email>
MAIL_CREDENTIAL=<app-password>
```

## Support

- Documentation: Full README.md in backend directory
- Health Check: GET `/pulse`
- API Info: GET `/nexus-info`
