# Quick Start Guide

## Prerequisites

- Node.js 18+ installed
- Backend running on http://localhost:8080

## Installation

```bash
cd frontend
npm install
```

## Development

Start the development server:

```bash
npm run begin
```

The app will be available at http://localhost:3000

## First Time Setup

1. Open http://localhost:3000
2. Click "Create account"
3. Register with email and password
4. Check your email for verification link (backend must be configured)
5. After verification, log in
6. Complete your profile by clicking "CREATE PROFILE"
7. Start browsing the feed!

## Key Features

### Create a Profile
1. Navigate to Profile tab (👤)
2. Click "CREATE PROFILE"
3. Fill in:
   - Artist Name (required)
   - First Name
   - Last Name
   - City
   - Bio
4. Click "SAVE"

### Create an Announcement
1. Click the Post tab (📢)
2. Fill in:
   - Title (required)
   - Description (required)
   - City
   - Check "Remote collaboration OK" if applicable
3. Click "POST"

### Browse and Save Announcements
1. Go to Feed tab (🎵)
2. Browse available announcements
3. Click "SAVE" on interesting ones
4. View saved items in Saved tab (💾)

### Manage Your Posts
1. Go to My Ads tab (📋)
2. View all your announcements
3. Click "DELETE" to remove

## Troubleshooting

### "Network error" messages
- Ensure backend is running on port 8080
- Check browser console for CORS errors
- Verify `/realm` proxy is working

### Can't log in after registration
- Email verification required
- Check backend email configuration
- Look for verification email in spam folder

### Profile won't save
- Artist Name is required
- Check network tab in browser DevTools
- Verify authentication token is being sent

### Empty feed
- No announcements exist yet
- Create the first one!

## Production Build

```bash
npm run compile
```

Output will be in `dist/` directory.

## Docker Deployment

```bash
docker build -t everymusic-frontend .
docker run -p 80:80 everymusic-frontend
```

Access at http://localhost

## Environment

No environment variables needed. All configuration is in `vite.config.js`.

## Browser Support

Works best in:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Mobile browsers

## Getting Help

1. Check IMPLEMENTATION.md for detailed documentation
2. Review backend API.md for API details
3. Check browser console for errors
4. Verify backend is running and accessible
