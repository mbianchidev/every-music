# Every.music

**Find your band. Build your musical network. Connect with musicians worldwide.**

---

## 🎵 What is Every.music?

Every.music is a platform that revolutionizes how musicians connect:

- **Find Band Members**: Browse announcements from musicians looking for collaborators
- **Build Your Profile**: Showcase your skills, instruments, and musical journey
- **Global Community**: Join musicians worldwide sharing the same passion

Think of it as:
- 🎸 LinkedIn for musicians
- 🎤 Craigslist for bands, but better
- 🎹 Instagram meets musical collaboration

---

## 🏗️ Architecture & Technology Stack

### Complete Re-implementation (2024)

This project has been completely rebuilt from the ground up with modern technologies:

**Backend API**
- **Fastify** - High-performance Node.js framework
- **PostgreSQL** - Robust relational database
- **Custom architecture** with unique naming conventions
- RESTful API with JWT authentication
- Located in: `./backend/`

**Frontend Web App**
- **React 18** - Modern UI framework
- **Vite** - Lightning-fast build tool
- Neo-Brutalist design with music festival aesthetics
- Single-file architecture for simplicity
- Located in: `./frontend/`

**Desktop App**
- **Tauri v2** - Cross-platform desktop wrapper
- Wraps the React frontend for Windows, macOS, Linux
- Native performance with web technologies
- Located in: `./frontend/src-tauri/`

**Mobile Apps**
- **Tauri v2** - Cross-platform mobile via the same codebase
- Android (SDK 24+ / Android 7.0+) and iOS support
- Edge-to-edge rendering with safe area insets
- Mobile-optimized touch targets and responsive layout
- Guide: `./frontend/MOBILE.md`

**Database**
- **PostgreSQL 16** - Production-grade database
- Complete schema for MVP features
- Seeded with instruments and genres data
- Schema in: `./backend/src/realm/schema.sql`

**Containerization**
- Docker support for all components
- docker-compose for full-stack orchestration
- Production-ready container configurations

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+ 
- **PostgreSQL** 16+ (or use Docker)
- **Rust** (for Tauri desktop builds)

### Running with Docker (Recommended)

```bash
# Start the entire stack
docker-compose up

# Access the application
# Frontend: http://localhost
# Backend API: http://localhost:8080
# Database: localhost:5432
```

### Running Locally

**1. Start the Database**

```bash
# Using Docker
docker run -d \
  --name everymusic-db \
  -e POSTGRES_USER=everymusician \
  -e POSTGRES_PASSWORD=everyband2024 \
  -e POSTGRES_DB=everymusic_realm \
  -p 5432:5432 \
  postgres:16-alpine

# Initialize schema
psql -h localhost -U everymusician -d everymusic_realm -f backend/src/realm/schema.sql
```

**2. Start the Backend**

```bash
cd backend
npm install
cp .env.template .env  # Edit with your settings
npm start
# API running on http://localhost:8080
```

**3. Start the Frontend**

```bash
cd frontend
npm install
npm run begin
# Web app running on http://localhost:3000
```

**4. Build Desktop App (Optional)**

```bash
cd frontend
npm run desktop        # Development mode
npm run desktop:build  # Production build
```

**5. Build Mobile Apps (Optional)**

```bash
cd frontend

# Android (requires Android Studio + NDK)
npm run android        # Run on device/emulator
npm run android:build  # Production APK/AAB

# iOS (requires macOS + Xcode)
npm run ios            # Run on simulator
npm run ios:build      # Production IPA
```

See `frontend/MOBILE.md` for detailed mobile setup instructions.

---

## 📖 MVP Features (v1.0.0)

### ✅ Authentication
- Email + password registration with verification
- Google OAuth integration
- JWT-based session management
- Secure password hashing

### ✅ User Profiles
- Create and edit profiles
- Add instruments with experience levels
- List musical projects and genres
- Upload profile pictures
- Search profiles with filters

### ✅ Announcements/Ads
- Create announcements looking for musicians
- Browse feed of all announcements
- Filter by location, instrument, genre
- Save favorite announcements
- Like/dislike system
- Set expiration dates

---

## 📂 Project Structure

```
every-music/
├── backend/                  # Fastify API server
│   ├── src/
│   │   ├── nexus.js         # Main server (unique naming)
│   │   ├── realm/           # Database layer
│   │   ├── orchestrators/   # Routes
│   │   ├── conductors/      # Business logic
│   │   ├── guards/          # Authentication
│   │   └── engines/         # Utilities
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                 # React + Vite web app
│   ├── src/
│   │   └── main.jsx         # Single-file app architecture
│   ├── src-tauri/           # Tauri desktop integration
│   ├── Dockerfile
│   └── package.json
│
├── docs/
│   └── main.md              # Original requirements & vision
│
├── docker-compose.yml        # Full-stack orchestration
└── README.md                # This file
```

---

## �� Unique Architecture Decisions

### Custom Naming Conventions

We use unique names throughout to make the codebase memorable:

- **Nexus** - Main server entry point (not "app" or "server")
- **Realm** - Database layer (not "db")
- **Conductors** - Business logic handlers (not "controllers")
- **Orchestrators** - Route definitions (not "routes")
- **Guards** - Authentication middleware (not "auth middleware")
- **Engines** - Utility functions (not "utils")
- **Nucleus** - Frontend state manager (not "store")
- **Conduit** - HTTP client (not "api" or "fetch")

### Single-File Frontend

The entire React frontend is in one `main.jsx` file (900+ lines):
- Reduces complexity
- Easy to understand flow
- No excessive file navigation
- Perfect for MVP scope

### Custom JWT Implementation

We implemented JWT from scratch without libraries:
- Better understanding of authentication
- No dependency vulnerabilities
- Custom claims and validation
- Educational value

---

## 🐳 Docker Support

### Individual Containers

```bash
# Backend only
cd backend && docker build -t everymusic-api .
docker run -p 8080:8080 everymusic-api

# Frontend only
cd frontend && docker build -t everymusic-web .
docker run -p 80:80 everymusic-web
```

### Full Stack

```bash
# Everything together
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop everything
docker-compose down
```

---

## 🔧 Development

### Backend Development

```bash
cd backend
npm install
npm run begin     # Start development server
npm run verify    # Validate code
```

### Frontend Development

```bash
cd frontend
npm install
npm run begin     # Start dev server (port 3000)
npm run compile   # Build for production
npm run serve     # Preview production build
```

### Desktop Development

```bash
cd frontend
npm run desktop          # Run Tauri in dev mode
npm run desktop:build    # Build desktop app
```

### Mobile Development

```bash
cd frontend
npm run android          # Run on Android device/emulator
npm run android:build    # Build Android APK/AAB
npm run ios              # Run on iOS simulator (macOS only)
npm run ios:build        # Build iOS IPA (macOS only)
```

For full mobile setup details, see [`frontend/MOBILE.md`](frontend/MOBILE.md).

---

## 🌍 Environment Variables

Create `.env` files from templates:

**Backend** (`backend/.env`)
```
NEXUS_PORT=8080
REALM_HOST=localhost
REALM_PORT=5432
REALM_NAME=everymusic_realm
REALM_USER=everymusician
REALM_SECRET=everyband2024
AUTH_TOKEN_KEY=your-secret-key-here
GOOGLE_OAUTH_ID=your-google-client-id
GOOGLE_OAUTH_SECRET=your-google-client-secret
```

**Frontend** (uses backend API URL)
- Configured in `src/main.jsx`
- Default: `http://localhost:8080`

---

## 📚 Documentation

- **API Documentation**: `backend/API.md`
- **Development Guide**: `backend/DEVELOPMENT.md`
- **Frontend Guide**: `frontend/GUIDE.md`
- **Original Vision**: `docs/main.md`
- **Implementation Details**: `backend/IMPLEMENTATION.md`

---

## 🛣️ Roadmap

See `docs/main.md` for the complete feature roadmap:

- **v1.0.0** - MVP (Current)
- **v2.0.0** - Community features, in-app messaging
- **v3.0.0** - Band profiles, group features
- **v4.0.0** - Events and concerts
- **v5.0.0** - Marketplace and services

---

## �� Contributing

This project welcomes contributions! 

1. Read the development guides in `backend/DEVELOPMENT.md` and `frontend/GUIDE.md`
2. Follow the unique naming conventions
3. Keep the codebase simple and maintainable
4. Test your changes thoroughly

---

## 📝 License

ISC License - See repository for details

---

## 🎸 Tech Philosophy

**Why these choices?**

- **Tauri over Electron**: Smaller bundle size, better performance
- **Fastify over Express**: Better performance, modern API
- **PostgreSQL**: Reliability and feature-richness for MVP
- **React**: Large community, mature ecosystem
- **Vite**: Fast builds, great DX
- **Docker**: Consistency across environments

**Principles:**
- ✨ Unique and memorable (custom naming)
- 🚀 Performance matters (Fastify, Tauri, Vite)
- 📦 Container-first (Docker everywhere)
- 🎯 MVP-focused (build what's needed)
- 🔒 Security-conscious (custom JWT, validation)

---

## 🎵 Join the Revolution

Every.music is more than an app - it's a movement to connect musicians globally and make collaboration effortless.

**Star this repo** if you believe in the vision!

**Questions?** Open an issue or check the docs.

Let's make music together. 🎸🎹🎤🎧
