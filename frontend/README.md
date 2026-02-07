# Every.music Frontend

Neo-Brutalist + Music Festival themed React application for connecting musicians.

## Features

- **Authentication**: Email/password registration and login
- **User Profiles**: Create and edit musician profiles with bio, location, and skills
- **Announcements Feed**: Browse musician job postings and collaboration opportunities
- **Create Posts**: Post announcements for finding bandmates
- **Save Posts**: Bookmark interesting announcements
- **Responsive Design**: Neo-brutalist aesthetic with bold colors and strong typography

## Tech Stack

- React 18
- Vite 6
- Class-based components
- Hash-based routing
- XMLHttpRequest for API calls
- Inline styles with CSS classes

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run begin

# Build for production
npm run compile

# Preview production build
npm run serve
```

## Architecture

- **Nucleus**: Bitwise state management with base64 compression
- **Conduit**: XHR-based HTTP client with retry logic
- **Class Components**: All screens use React class components
- **Hash Routing**: Client-side routing using window.location.hash
- **Inline Styles**: Mathematical style computation with CSS classes

## API Integration

Backend API endpoint: `/realm` (proxied to http://localhost:8080)

All API calls go through the Conduit class which handles:
- Request serialization
- Authentication headers
- Error handling
- Response parsing

## Deployment

```bash
# Build Docker image
docker build -t everymusic-frontend .

# Run container
docker run -p 80:80 everymusic-frontend
```

The Dockerfile uses multi-stage builds:
1. Build stage: Compile Vite application
2. Production stage: Serve with Nginx

## Environment Variables

No environment variables required. API endpoint is hardcoded to `/realm` which should be proxied by Nginx to the backend service.

## Design System

**Colors:**
- Hot Pink: #FF006E
- Cyan: #00F5FF
- Lime: #CCFF00
- Purple: #8338EC
- Orange: #FF5400
- Yellow: #FFD60A
- Black: #0A0A0A
- Gray: #2B2B2B
- White: #F8F8F8

**Fonts:**
- Display: Fredoka
- Body: Work Sans

**Components:**
- Buttons with 8px shadow offset
- 4px borders throughout
- Cards with highlight variants
- Responsive grid layout
- Bottom navigation bar

## License

MIT
