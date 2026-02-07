# Every.music Backend API (Nexus)

## 🎵 Overview

The **Nexus** is the orchestration layer for Every.music - a platform connecting musicians worldwide. Built with Fastify and PostgreSQL, it provides a high-performance, production-ready API for authentication, user profiles, and musician announcements.

## 🏗️ Architecture

### Unique Design Patterns

This backend uses a **domain-driven orchestration pattern** with distinctive naming:

- **Nexus**: The main server orchestrator
- **Realm**: The database layer (PostgreSQL)
- **Conductors**: Request handlers (business logic)
- **Orchestrators**: Route definitions and request routing
- **Engines**: Utility services (cipher, mail, identity)
- **Repositories**: Data access layer
- **Guards**: Authentication middleware
- **Validators**: Input validation
- **Transformers**: Data transformation (in conductors)

### Technology Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify 4.x
- **Database**: PostgreSQL 16
- **Authentication**: Custom JWT implementation
- **OAuth**: Google Identity Platform
- **Email**: Nodemailer
- **Containerization**: Docker & Docker Compose

## 🚀 Quick Start

### Prerequisites

- Node.js 20 or higher
- PostgreSQL 16
- Docker & Docker Compose (for containerized deployment)

### Local Development

1. **Clone and navigate to backend:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up database:**
   ```bash
   # Create PostgreSQL database
   createdb everymusic_realm
   
   # Run migrations and seeds
   npm run bootstrap
   ```

5. **Start development server:**
   ```bash
   npm run watch
   ```

   The API will be available at `http://localhost:8080`

### Docker Deployment

1. **Create `.env` file:**
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

2. **Generate secure secrets:**
   ```bash
   # Linux/Mac
   openssl rand -base64 48
   
   # Use output for CIPHER_PRIMARY_KEY and CIPHER_REFRESH_KEY
   ```

3. **Start services:**
   ```bash
   docker-compose up --build
   ```

   - API: `http://localhost:8080`
   - Database: `localhost:5432`

4. **Check health:**
   ```bash
   curl http://localhost:8080/pulse
   ```

## 📋 API Endpoints

### Health & Info

#### `GET /pulse`
Check API health and database connection.

**Response:**
```json
{
  "status": "alive",
  "realm": "connected",
  "timestamp": "2024-02-07T12:00:00.000Z",
  "uptime": 123.45,
  "environment": "development"
}
```

#### `GET /nexus-info`
Get API information and available routes.

### Authentication (`/realm/auth`)

#### `POST /realm/auth/register`
Register a new user with email and password.

**Request:**
```json
{
  "email": "musician@example.com",
  "password": "SecurePass123"
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "musician@example.com",
    "emailVerified": false,
    "message": "Registration successful. Please check your email to verify your account."
  }
}
```

#### `POST /realm/auth/login`
Login with email and password.

**Request:**
```json
{
  "email": "musician@example.com",
  "password": "SecurePass123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "userId": "uuid",
      "email": "musician@example.com",
      "emailVerified": true
    }
  }
}
```

#### `POST /realm/auth/login/google`
Login with Google OAuth.

**Request:**
```json
{
  "idToken": "google-id-token"
}
```

**Response:** Same as email login

#### `GET /realm/auth/verify-email?token=<token>`
Verify email address.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Email verified successfully",
    "email": "musician@example.com"
  }
}
```

#### `POST /realm/auth/refresh-token`
Refresh access token.

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "new-access-token",
    "refreshToken": "new-refresh-token"
  }
}
```

#### `POST /realm/auth/password-reset/initiate`
Initiate password reset.

**Request:**
```json
{
  "email": "musician@example.com"
}
```

#### `POST /realm/auth/password-reset/complete`
Complete password reset.

**Request:**
```json
{
  "token": "reset-token",
  "newPassword": "NewSecurePass123"
}
```

#### `POST /realm/auth/logout`
Logout and revoke refresh token.

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

### Profiles (`/realm/profiles`)

All profile endpoints except `/search` require authentication.

#### `GET /realm/profiles/me`
Get current user's profile.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "artistName": "John Rocker",
    "firstName": "John",
    "lastName": "Doe",
    "age": 25,
    "city": "Los Angeles",
    "state": "California",
    "country": "USA",
    "location": {
      "latitude": 34.0522,
      "longitude": -118.2437
    },
    "bio": "Professional guitarist with 10 years of experience...",
    "profilePictureUrl": "https://...",
    "contacts": {
      "phone": "+1234567890",
      "telegramId": "@johndoe",
      "whatsapp": "+1234567890",
      "signal": "+1234567890",
      "websiteUrl": "https://johndoe.com"
    },
    "instruments": [
      {
        "instrument_id": "uuid",
        "name": "Electric Guitar",
        "category": "string",
        "years_experience": 10,
        "skill_level": "professional"
      }
    ],
    "genres": [
      {
        "genre_id": "uuid",
        "name": "Rock"
      }
    ],
    "projects": [
      {
        "id": "uuid",
        "name": "The Rockers",
        "years_active": "2015-2020",
        "role": "Lead Guitarist",
        "description": "...",
        "spotify_link": "https://spotify.com/...",
        "youtube_link": "https://youtube.com/..."
      }
    ]
  }
}
```

#### `PUT /realm/profiles/me`
Update current user's profile.

**Request:**
```json
{
  "artistName": "John Rocker",
  "firstName": "John",
  "lastName": "Doe",
  "age": 25,
  "city": "Los Angeles",
  "state": "California",
  "country": "USA",
  "latitude": 34.0522,
  "longitude": -118.2437,
  "bio": "Professional guitarist...",
  "profilePictureUrl": "https://...",
  "phone": "+1234567890",
  "telegramId": "@johndoe",
  "whatsapp": "+1234567890",
  "signal": "+1234567890",
  "websiteUrl": "https://johndoe.com",
  "instruments": [
    {
      "instrumentId": "uuid",
      "yearsExperience": 10,
      "skillLevel": "professional"
    }
  ],
  "genreIds": ["uuid1", "uuid2"]
}
```

#### `GET /realm/profiles/search`
Search for musician profiles.

**Query Parameters:**
- `city` (optional): Filter by city
- `instrumentId` (optional): Filter by instrument
- `genreId` (optional): Filter by genre
- `searchTerm` (optional): Search in name and bio
- `page` (optional, default: 1)
- `pageSize` (optional, default: 20, max: 100)

**Example:**
```
GET /realm/profiles/search?city=Los%20Angeles&instrumentId=uuid&page=1&pageSize=20
```

#### `GET /realm/profiles/:profileId`
Get a specific profile by user ID.

#### `POST /realm/profiles/me/projects`
Add a project to your profile.

**Request:**
```json
{
  "name": "The Rockers",
  "yearsActive": "2015-2020",
  "role": "Lead Guitarist",
  "description": "...",
  "spotifyLink": "https://spotify.com/...",
  "youtubeLink": "https://youtube.com/...",
  "bandcampLink": "https://bandcamp.com/...",
  "soundcloudLink": "https://soundcloud.com/...",
  "websiteLink": "https://..."
}
```

#### `DELETE /realm/profiles/me/projects/:projectId`
Remove a project from your profile.

### Announcements (`/realm/announcements`)

#### `POST /realm/announcements/`
Create a new announcement.

**Request:**
```json
{
  "title": "Looking for a bassist",
  "description": "Progressive metal band seeking experienced bassist...",
  "pictureUrl": "https://...",
  "city": "Los Angeles",
  "state": "California",
  "country": "USA",
  "latitude": 34.0522,
  "longitude": -118.2437,
  "isRemote": false,
  "isCoverBand": false,
  "expiresAt": "2024-12-31T23:59:59Z",
  "isPublished": true,
  "instrumentIds": ["uuid1", "uuid2"],
  "genreIds": ["uuid1", "uuid2"],
  "links": [
    {
      "linkType": "spotify",
      "url": "https://spotify.com/..."
    }
  ]
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "title": "Looking for a bassist",
    ...
  }
}
```

#### `GET /realm/announcements/search`
Search announcements with filters.

**Query Parameters:**
- `instrumentId` (optional)
- `genreId` (optional)
- `city` (optional)
- `isRemote` (optional): "true" or "false"
- `isCoverBand` (optional): "true" or "false"
- `searchTerm` (optional)
- `page` (optional, default: 1)
- `pageSize` (optional, default: 20, max: 100)

#### `GET /realm/announcements/me`
Get your announcements (requires authentication).

#### `GET /realm/announcements/saved`
Get your saved announcements (requires authentication).

#### `GET /realm/announcements/:announcementId`
Get a specific announcement.

#### `PUT /realm/announcements/:announcementId`
Update your announcement (requires authentication).

#### `DELETE /realm/announcements/:announcementId`
Delete your announcement (requires authentication).

#### `POST /realm/announcements/:announcementId/react`
React to an announcement (like/dislike).

**Request:**
```json
{
  "reactionType": "like"
}
```

Valid values: `"like"`, `"dislike"`

#### `POST /realm/announcements/:announcementId/save`
Save an announcement to your bookmarks.

#### `DELETE /realm/announcements/:announcementId/save`
Remove an announcement from your bookmarks.

### Catalog (`/realm/catalog`)

#### `GET /realm/catalog/instruments`
Get all available instruments.

**Response:**
```json
{
  "success": true,
  "data": {
    "instruments": [
      {
        "id": "uuid",
        "name": "Electric Guitar",
        "category": "string"
      },
      ...
    ]
  }
}
```

#### `GET /realm/catalog/genres`
Get all available genres.

**Response:**
```json
{
  "success": true,
  "data": {
    "genres": [
      {
        "id": "uuid",
        "name": "Rock",
        "parentGenreId": null,
        "parentGenreName": null
      },
      {
        "id": "uuid",
        "name": "Progressive Rock",
        "parentGenreId": "parent-uuid",
        "parentGenreName": "Rock"
      }
    ]
  }
}
```

## 🔐 Authentication

The API uses a custom JWT-based authentication system.

### Token Types

1. **Access Token**: Short-lived (7 days default), used for API requests
2. **Refresh Token**: Long-lived (30 days default), used to obtain new access tokens

### Using Tokens

Include the access token in the `Authorization` header:

```
Authorization: Bearer <access-token>
```

### Token Refresh Flow

1. When access token expires, use refresh token to get new tokens
2. Include refresh token in request body to `/realm/auth/refresh-token`
3. Old refresh token is revoked, new tokens are issued
4. Update your stored tokens

## ⚙️ Configuration

### Environment Variables

#### Required

- `REALM_CONNECTION`: PostgreSQL connection string
- `CIPHER_PRIMARY_KEY`: JWT signing key (min 32 chars)
- `CIPHER_REFRESH_KEY`: Refresh token key (min 32 chars)

#### Optional

- `REALM_ENV`: Environment (`development`, `production`)
- `NEXUS_PORT`: Server port (default: 8080)
- `NEXUS_HOST`: Server host (default: 0.0.0.0)
- `PORTAL_ORIGIN`: Frontend URL for CORS (default: http://localhost:3000)
- `GOOGLE_IDENTITY_KEY`: Google OAuth client ID
- `GOOGLE_IDENTITY_LOCK`: Google OAuth client secret
- `MAIL_GATEWAY`: SMTP host
- `MAIL_PORT`: SMTP port
- `MAIL_IDENTITY`: SMTP username
- `MAIL_CREDENTIAL`: SMTP password

### Security Recommendations

1. **Generate strong secrets:**
   ```bash
   openssl rand -base64 48
   ```

2. **Use environment-specific configurations**
3. **Enable HTTPS in production**
4. **Configure proper CORS origins**
5. **Use strong database passwords**
6. **Rotate secrets regularly**

## 🗄️ Database Schema

### Core Tables

- **users**: Authentication and user accounts
- **profiles**: Musician profile information
- **instruments**: Available instruments catalog
- **genres**: Music genres catalog
- **user_instruments**: User-instrument relationships with experience
- **user_genres**: User-genre preferences
- **projects**: User's past/current musical projects
- **announcements**: Job postings/band member searches
- **announcement_instruments**: Instruments needed for announcements
- **announcement_genres**: Genres for announcements
- **announcement_reactions**: Like/dislike on announcements
- **saved_announcements**: User bookmarks
- **refresh_tokens**: JWT refresh tokens
- **followers**: User follow relationships

## 📊 Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": ["Additional error details"]
  }
}
```

### Common Error Codes

- `VALIDATION_ERROR`: Invalid input data
- `MISSING_CREDENTIALS`: Missing authentication
- `INVALID_TOKEN`: Invalid or expired token
- `UNAUTHORIZED`: Not authorized for this resource
- `NOT_FOUND`: Resource not found
- `EMAIL_TAKEN`: Email already registered
- `INVALID_CREDENTIALS`: Wrong email/password
- `RATE_LIMIT_EXCEEDED`: Too many requests

## 🧪 Testing

```bash
# Test database connection
curl http://localhost:8080/pulse

# Register a user
curl -X POST http://localhost:8080/realm/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# Login
curl -X POST http://localhost:8080/realm/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# Get instruments
curl http://localhost:8080/realm/catalog/instruments

# Search profiles
curl "http://localhost:8080/realm/profiles/search?city=Los%20Angeles&page=1"
```

## 📝 Development

### Project Structure

```
backend/
├── config/
│   └── realm.js                 # Configuration management
├── database/
│   ├── schema.sql              # Database schema
│   └── seeds/                  # Seed data
│       ├── instruments.sql
│       └── genres.sql
├── scripts/
│   └── bootstrap-realm.js      # Database setup script
├── src/
│   ├── conductors/             # Business logic handlers
│   │   ├── authentication-conductor.js
│   │   ├── musician-conductor.js
│   │   └── opportunity-conductor.js
│   ├── engines/                # Utility services
│   │   ├── cipher-engine.js
│   │   ├── mail-dispatcher.js
│   │   └── google-identity-bridge.js
│   ├── guards/                 # Authentication middleware
│   │   └── identity-guard.js
│   ├── orchestrators/          # Route definitions
│   │   ├── auth-orchestrator.js
│   │   ├── profile-orchestrator.js
│   │   ├── announcement-orchestrator.js
│   │   └── catalog-orchestrator.js
│   ├── repositories/           # Data access layer
│   │   ├── realm-connector.js
│   │   ├── identity-repository.js
│   │   ├── musician-repository.js
│   │   └── opportunity-repository.js
│   ├── validators/             # Input validation
│   │   └── input-validator.js
│   └── nexus.js               # Main server file
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

### Adding New Features

1. Create repository methods in `repositories/`
2. Create conductor methods in `conductors/`
3. Define routes in `orchestrators/`
4. Register orchestrator in `nexus.js`

### Code Style

- Use ES modules (`import`/`export`)
- Async/await for async operations
- Descriptive variable names
- Error handling in try-catch blocks
- Repository pattern for database access
- Conductor pattern for business logic

## 🚢 Production Deployment

### Docker Deployment

1. Build production image:
   ```bash
   docker build -t everymusic-nexus:latest .
   ```

2. Run with docker-compose:
   ```bash
   docker-compose up -d
   ```

### Environment Checklist

- [ ] Set strong `CIPHER_PRIMARY_KEY`
- [ ] Set strong `CIPHER_REFRESH_KEY`
- [ ] Configure production database
- [ ] Set production `PORTAL_ORIGIN`
- [ ] Configure Google OAuth credentials
- [ ] Configure SMTP for emails
- [ ] Set `REALM_ENV=production`
- [ ] Enable HTTPS/SSL
- [ ] Configure reverse proxy (nginx)
- [ ] Set up monitoring and logging
- [ ] Configure backups

## 📄 License

MIT License - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For issues and questions:
- GitHub Issues: [repository-url]/issues
- Email: support@everymusic.com
- Documentation: https://docs.everymusic.com

---

**Built with ❤️ for the music community**
