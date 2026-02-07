# Every.music Frontend - Complete Implementation

## Overview

A complete React + Vite frontend application for Every.music with a bold Neo-Brutalist + Music Festival aesthetic. Built with class-based components, hash routing, and a unique state management system.

## Architecture

### State Management - Nucleus Class
- **Bitwise flags** for authorization state
- **Base64 compression** for sessionStorage
- **Observer pattern** for reactive updates
- Automatic persistence and rehydration

### HTTP Client - Conduit Class  
- **XMLHttpRequest-based** implementation
- Automatic authorization header injection
- Promise-based API
- Error handling with typed errors

### Routing
- **Hash-based navigation** using window.location.hash
- No external router dependencies
- State preserved across navigation
- Back button support via browser history

### Components
All components use **React.Component** class-based architecture:
- `BootScreen` - Splash screen with auth detection
- `AuthScreen` - Login with email/password
- `RegisterScreen` - Registration with email verification flow
- `FeedScreen` - Browse announcements feed
- `ProfileScreen` - View own profile
- `EditProfileScreen` - Edit profile information
- `CreatePostScreen` - Create new announcement
- `MyPostsScreen` - View and manage own posts
- `SavedPostsScreen` - View saved/bookmarked posts
- `Navigation` - Bottom navigation bar
- `Orchestrator` - Main routing component

## Design System

### Color Palette
```css
Hot Pink: #FF006E
Cyan: #00F5FF  
Lime: #CCFF00
Purple: #8338EC
Orange: #FF5400
Yellow: #FFD60A
Black: #0A0A0A
Gray: #2B2B2B
White: #F8F8F8
```

### Typography
- **Display**: Fredoka (bold, uppercase headings)
- **Body**: Work Sans (readable body text)
- **Scale**: clamp() for responsive sizing

### Visual Style
- **8px shadow offset** on all buttons
- **4px borders** throughout UI
- **Bold, high-contrast** color combinations
- **Card-based layouts** with highlight variants
- **Grid systems** for feed/list views
- **Fixed bottom navigation** for mobile-first design

### Animations
- Hover transforms (translate 4px, 4px)
- Active state (translate 8px, 8px - no shadow)
- Spinner rotation for loading states
- Smooth transitions (0.15s ease)

## API Integration

### Base URL
All requests go to `/realm` which proxies to `http://localhost:8080`

### Authentication Flow
```javascript
// Register
conduit.transmit('/auth/register', { 
  method: 'POST', 
  body: { email, password } 
})

// Login
conduit.transmit('/auth/login', { 
  method: 'POST', 
  body: { email, password } 
})
// Returns: { user, accessToken, refreshToken }

// Logout
conduit.transmit('/auth/logout', { 
  method: 'POST', 
  auth: true 
})
```

### Profile Operations
```javascript
// Get own profile
conduit.transmit('/profiles/me', { auth: true })

// Update profile
conduit.transmit('/profiles/me', { 
  method: 'PUT', 
  auth: true, 
  body: { artistName, firstName, lastName, city, bio } 
})
```

### Announcement Operations
```javascript
// Search announcements
conduit.transmit('/announcements/search')

// Create announcement
conduit.transmit('/announcements/', { 
  method: 'POST', 
  auth: true, 
  body: { title, description, city, isRemote, instrumentIds, genreIds } 
})

// Get my announcements
conduit.transmit('/announcements/me', { auth: true })

// Get saved announcements
conduit.transmit('/announcements/saved', { auth: true })

// Save announcement
conduit.transmit('/announcements/${id}/save', { 
  method: 'POST', 
  auth: true 
})

// Delete announcement
conduit.transmit('/announcements/${id}', { 
  method: 'DELETE', 
  auth: true 
})
```

## File Structure

```
frontend/
├── public/                 # Static assets (none currently)
├── src/
│   └── main.jsx           # Main application entry (34KB single file)
├── index.html             # HTML entry point with Google Fonts
├── vite.config.js         # Vite configuration with proxy
├── package.json           # Dependencies and scripts
├── Dockerfile             # Multi-stage Docker build
├── nginx.conf             # Nginx config for production
├── README.md              # Documentation
├── .gitignore            # Git ignore rules
└── .dockerignore         # Docker ignore rules
```

## Build & Deployment

### Development
```bash
npm install
npm run begin          # Starts dev server on port 3000
```

### Production Build
```bash
npm run compile        # Builds to dist/
npm run serve          # Preview production build
```

### Docker
```bash
# Build image
docker build -t everymusic-frontend .

# Run container
docker run -p 80:80 everymusic-frontend
```

### Docker Compose Integration
```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:80"
    environment:
      - BACKEND_URL=http://backend:8080
    depends_on:
      - backend
```

## Features Implemented

### ✅ Authentication
- [x] Email/password registration
- [x] Email verification flow (UI only, backend handles verification)
- [x] Login with credentials
- [x] Logout
- [x] Session persistence
- [x] Automatic auth state restoration
- [ ] Google OAuth (placeholder in UI)

### ✅ User Profiles
- [x] Create profile (artistName, firstName, lastName, city, bio)
- [x] Edit profile
- [x] View own profile
- [x] Display instruments and genres (read-only from backend)
- [x] Profile completeness detection

### ✅ Announcements
- [x] Browse feed of all announcements
- [x] Create new announcement
- [x] View own announcements
- [x] Delete announcements
- [x] Save/bookmark announcements
- [x] View saved announcements
- [x] Display location and remote status
- [x] Show instrument tags

### ✅ Navigation
- [x] Hash-based routing
- [x] Bottom navigation bar
- [x] Active state indication
- [x] Back button support

### ✅ UI/UX
- [x] Loading states with spinner
- [x] Error message display
- [x] Success message display
- [x] Form validation
- [x] Disabled states during operations
- [x] Empty states with CTAs
- [x] Responsive grid layouts
- [x] Mobile-friendly design

## Known Limitations

1. **No Search/Filter UI** - Feed shows all announcements without filters
2. **No Instrument/Genre Selection** - Profile editing doesn't include adding instruments/genres
3. **No Google OAuth** - Placeholder button only
4. **No Image Upload** - Profile pictures not implemented
5. **No Real-time Updates** - Manual refresh required
6. **No Pagination** - Loads all results at once
7. **No Detail View** - Can't view individual announcement details
8. **No User Search** - Can't search for other musicians
9. **Basic Error Handling** - Simple alert() for errors
10. **No Loading Indicators on Individual Actions** - Only on page loads

## Browser Compatibility

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

Requires:
- ES6+ support
- Promises
- XMLHttpRequest
- sessionStorage
- CSS Grid
- CSS Flexbox
- clamp() CSS function

## Performance Considerations

- Single 170KB JavaScript bundle (51KB gzipped)
- Minimal external dependencies (React + ReactDOM only)
- No lazy loading (all code loads upfront)
- No code splitting
- CSS in JS (injected at runtime)
- Google Fonts loaded from CDN

## Security Notes

- Tokens stored in sessionStorage (not localStorage for better security)
- Base64 encoding for storage (obfuscation, not encryption)
- HTTPS should be used in production
- No XSS protection beyond React's default escaping
- CORS handled by backend

## Future Enhancements

1. Add instrument/genre selection in profile editor
2. Implement search and filter for announcements
3. Add profile search functionality
4. Implement Google OAuth flow
5. Add image upload for profiles and announcements
6. Implement real-time updates with WebSockets
7. Add pagination for large lists
8. Create detail views for announcements and profiles
9. Add notification system
10. Implement chat/messaging
11. Add project management for profiles
12. Implement responsive design improvements
13. Add accessibility features (ARIA labels, keyboard navigation)
14. Implement service worker for offline support
15. Add analytics tracking

## Maintenance

### Dependencies Update
```bash
npm update
```

### Security Audit
```bash
npm audit
npm audit fix
```

### Bundle Size Analysis
```bash
npm run compile -- --analyze
```

## Support

For issues or questions:
1. Check backend API documentation in `/backend/API.md`
2. Review main.md for product requirements
3. Check browser console for errors
4. Verify backend is running on port 8080

## License

MIT
