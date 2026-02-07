# Development Guide - Every.music Backend

## 🎯 For Developers

### Prerequisites Setup

1. **Install Node.js 20+**
   ```bash
   # Using nvm (recommended)
   nvm install 20
   nvm use 20
   
   # Verify
   node --version  # Should be v20.x.x
   ```

2. **Install PostgreSQL 16**
   ```bash
   # macOS
   brew install postgresql@16
   brew services start postgresql@16
   
   # Ubuntu/Debian
   sudo apt install postgresql-16
   sudo systemctl start postgresql
   
   # Verify
   psql --version  # Should be 16.x
   ```

3. **Create Database**
   ```bash
   # Create database
   createdb everymusic_realm
   
   # Or using psql
   psql -U postgres
   CREATE DATABASE everymusic_realm;
   \q
   ```

### Initial Setup

1. **Clone and Install**
   ```bash
   cd backend
   npm install
   ```

2. **Configure Environment**
   ```bash
   # Copy example
   cp .env.example .env
   
   # Edit .env - minimum required:
   # - REALM_CONNECTION (database URL)
   # - CIPHER_PRIMARY_KEY (64 chars)
   # - CIPHER_REFRESH_KEY (64 chars)
   ```

3. **Generate Secure Keys**
   ```bash
   # Generate random keys for development
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   # Copy output to CIPHER_PRIMARY_KEY
   
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   # Copy output to CIPHER_REFRESH_KEY
   ```

4. **Initialize Database**
   ```bash
   npm run bootstrap
   ```
   
   This will:
   - Create all tables
   - Add foreign keys and indexes
   - Seed instruments (60+)
   - Seed genres (40+)
   - Create triggers

5. **Start Development Server**
   ```bash
   npm run watch
   ```
   
   The server will:
   - Start on http://localhost:8080
   - Auto-reload on file changes
   - Show detailed logs with colors

### Testing the API

1. **Health Check**
   ```bash
   curl http://localhost:8080/pulse
   ```
   
   Expected: Status 200 with realm connected

2. **Get Instruments**
   ```bash
   curl http://localhost:8080/realm/catalog/instruments | jq
   ```
   
   Expected: List of 60+ instruments

3. **Register User**
   ```bash
   curl -X POST http://localhost:8080/realm/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@everymusic.com",
       "password": "TestPass123"
     }' | jq
   ```
   
   Expected: User created with ID

4. **Login**
   ```bash
   curl -X POST http://localhost:8080/realm/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "test@everymusic.com",
       "password": "TestPass123"
     }' | jq
   ```
   
   Expected: Access and refresh tokens
   
   Save the accessToken for next requests!

5. **Get Profile (Authenticated)**
   ```bash
   curl http://localhost:8080/realm/profiles/me \
     -H "Authorization: Bearer <your-access-token>" | jq
   ```

### Development Workflow

#### Adding a New Feature

1. **Database Changes** (if needed)
   - Add table/column to `database/schema.sql`
   - Run `npm run bootstrap` (will recreate DB)
   - Or write migration script

2. **Repository Layer**
   - Add methods to appropriate repository
   - Example: `src/repositories/musician-repository.js`
   - Handle database queries and errors

3. **Conductor Layer**
   - Add business logic to conductor
   - Example: `src/conductors/musician-conductor.js`
   - Validate input, call repository, transform output

4. **Orchestrator Layer**
   - Define routes in orchestrator
   - Example: `src/orchestrators/profile-orchestrator.js`
   - Attach guards if authentication needed

5. **Register Routes**
   - Register orchestrator in `src/nexus.js`
   - Add to main server

#### Example: Adding a "Follow User" Feature

1. **Check Database** (already exists: `followers` table)

2. **Add Repository Methods** (`musician-repository.js`):
   ```javascript
   async followUser(followerId, followingId) {
     const query = `
       INSERT INTO followers (follower_id, following_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING
       RETURNING *
     `;
     const result = await realmConnector.execute(query, [followerId, followingId]);
     return result.rows[0];
   }
   
   async unfollowUser(followerId, followingId) {
     const query = `
       DELETE FROM followers
       WHERE follower_id = $1 AND following_id = $2
       RETURNING *
     `;
     const result = await realmConnector.execute(query, [followerId, followingId]);
     return result.rows[0];
   }
   ```

3. **Add Conductor Methods** (`musician-conductor.js`):
   ```javascript
   async followUser(request, reply) {
     const { userId } = request.authenticatedUser;
     const { profileId } = request.params;
     
     if (userId === profileId) {
       return reply.code(400).send({
         success: false,
         error: { code: 'SELF_FOLLOW', message: 'Cannot follow yourself' }
       });
     }
     
     try {
       await musicianRepository.followUser(userId, profileId);
       return reply.code(200).send({
         success: true,
         data: { message: 'User followed' }
       });
     } catch (err) {
       // Handle error
     }
   }
   ```

4. **Add Routes** (`profile-orchestrator.js`):
   ```javascript
   fastify.post('/:profileId/follow', {
     preHandler: identityGuard,
   }, async (request, reply) => {
     return musicianConductor.followUser(request, reply);
   });
   ```

### Debugging

#### Enable Detailed Logs
Already enabled in development mode with pino-pretty

#### Check Database Queries
```bash
# Connect to database
psql everymusic_realm

# Check users
SELECT * FROM users;

# Check profiles
SELECT * FROM profiles;

# Check announcements
SELECT * FROM announcements;
```

#### Common Issues

**Issue**: "Database not found"
```bash
# Solution: Create database
createdb everymusic_realm
npm run bootstrap
```

**Issue**: "Password authentication failed"
```bash
# Solution: Check REALM_CONNECTION in .env
# Make sure username/password match your PostgreSQL setup
```

**Issue**: "Port 8080 already in use"
```bash
# Solution: Change port in .env
NEXUS_PORT=3001

# Or kill process
lsof -i :8080
kill -9 <PID>
```

**Issue**: "Module not found"
```bash
# Solution: Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Code Style Guidelines

1. **Use async/await** (not callbacks or .then())
2. **Try-catch blocks** for all async operations
3. **Descriptive names**: `createAnnouncement` not `create`
4. **Error handling**: Always return proper error codes
5. **Validation**: Validate input before database operations
6. **Comments**: Add comments for complex logic
7. **ES modules**: Use `import`/`export`
8. **Consistent formatting**: Use 2 spaces for indentation

### Testing Strategy

#### Manual Testing
Use curl commands (see API.md)

#### Integration Testing
```bash
# Start test database
createdb everymusic_realm_test

# Set test environment
export REALM_ENV=test
export REALM_CONNECTION=postgresql://postgres:postgres@localhost:5432/everymusic_realm_test

# Run bootstrap
npm run bootstrap

# Test endpoints
npm test  # (when tests are added)
```

### Docker Development

#### Using Docker Compose
```bash
# Start all services
docker-compose up

# Rebuild after changes
docker-compose up --build

# View logs
docker-compose logs -f nexus-api

# Stop services
docker-compose down

# Remove volumes (clean database)
docker-compose down -v
```

#### Accessing Services
- API: http://localhost:8080
- Database: localhost:5432
  ```bash
  psql -h localhost -U postgres -d everymusic_realm
  ```

### Project Structure Best Practices

```
src/
├── conductors/      # Business logic ONLY
│   ├── Validate input
│   ├── Call repositories
│   ├── Transform data
│   └── Return responses
│
├── repositories/    # Database operations ONLY
│   ├── SQL queries
│   ├── Connection management
│   └── Error handling
│
├── orchestrators/   # Route definitions ONLY
│   ├── Define endpoints
│   ├── Attach guards
│   └── Call conductors
│
├── engines/         # Utility services
│   └── Reusable functionality
│
├── guards/          # Authentication checks
│   └── Token verification
│
└── validators/      # Input validation
    └── Validation rules
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/follow-users

# Make changes
# ... edit files ...

# Test locally
npm run watch
# Test your changes

# Commit
git add .
git commit -m "Add follow/unfollow user feature"

# Push
git push origin feature/follow-users

# Create pull request
```

### Environment Variables Reference

```bash
# Development
REALM_ENV=development
NEXUS_PORT=8080
REALM_CONNECTION=postgresql://postgres:postgres@localhost:5432/everymusic_realm

# Production (change these!)
REALM_ENV=production
CIPHER_PRIMARY_KEY=<generate-64-char-random>
CIPHER_REFRESH_KEY=<generate-64-char-random>

# Optional
GOOGLE_IDENTITY_KEY=<google-oauth-client-id>
GOOGLE_IDENTITY_LOCK=<google-oauth-secret>
MAIL_IDENTITY=<gmail-address>
MAIL_CREDENTIAL=<gmail-app-password>
```

### Useful Commands

```bash
# Development
npm run watch         # Auto-reload server
npm start            # Production server
npm run bootstrap    # Initialize database

# Database
psql everymusic_realm                    # Connect
psql everymusic_realm -c "SELECT NOW()"  # Quick query

# Docker
docker-compose up --build    # Rebuild and start
docker-compose logs -f       # Follow logs
docker-compose down -v       # Clean everything

# Debugging
node --inspect src/nexus.js  # Enable debugger
```

### Resources

- **Fastify Docs**: https://www.fastify.io/docs/
- **PostgreSQL Docs**: https://www.postgresql.org/docs/
- **Node.js Docs**: https://nodejs.org/docs/
- **bcrypt**: https://www.npmjs.com/package/bcrypt
- **nodemailer**: https://nodemailer.com/

### Need Help?

1. Check README.md for comprehensive guide
2. Check API.md for endpoint examples
3. Check IMPLEMENTATION.md for architecture overview
4. Review code comments in source files
5. Test with curl commands
6. Check logs in console

---

**Happy Coding! 🎵**
