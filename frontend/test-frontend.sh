#!/bin/bash
echo "🎵 Every.music Frontend Verification"
echo "===================================="
echo ""

echo "✓ Checking Node.js..."
node -v

echo "✓ Checking npm..."
npm -v

echo "✓ Checking project files..."
[ -f "package.json" ] && echo "  - package.json exists"
[ -f "src/main.jsx" ] && echo "  - main.jsx exists ($(wc -l < src/main.jsx) lines)"
[ -f "Dockerfile" ] && echo "  - Dockerfile exists"
[ -f "nginx.conf" ] && echo "  - nginx.conf exists"

echo ""
echo "✓ Testing build..."
npm run build

echo ""
echo "✓ Checking dist output..."
ls -lh dist/

echo ""
echo "✓ Bundle size:"
du -sh dist/

echo ""
echo "🎸 Frontend verification complete!"
