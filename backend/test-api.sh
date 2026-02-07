#!/bin/bash

# Quick Start Test Script for Every.music Backend
# This script tests the basic functionality of the API

set -e

API_URL=${API_URL:-http://localhost:8080}
TEST_EMAIL="test-$(date +%s)@everymusic.com"
TEST_PASSWORD="TestPass123"

echo "🎵 Every.music Backend - Quick Start Test"
echo "=========================================="
echo ""
echo "API URL: $API_URL"
echo "Test Email: $TEST_EMAIL"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local headers=$5
  
  echo -n "Testing: $name... "
  
  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" $headers)
  else
    response=$(curl -s -w "\n%{http_code}" -X $method "$API_URL$endpoint" \
      -H "Content-Type: application/json" \
      $headers \
      -d "$data")
  fi
  
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')
  
  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}✓ PASSED${NC} (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    return 0
  else
    echo -e "${RED}✗ FAILED${NC} (HTTP $http_code)"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
    return 1
  fi
}

echo "1️⃣  Testing Health Endpoint"
echo "----------------------------"
test_endpoint "Health Check" "GET" "/pulse"
echo ""

echo "2️⃣  Testing Catalog Endpoints"
echo "------------------------------"
test_endpoint "Get Instruments" "GET" "/realm/catalog/instruments"
echo ""
test_endpoint "Get Genres" "GET" "/realm/catalog/genres"
echo ""

echo "3️⃣  Testing Authentication"
echo "--------------------------"

# Register
echo "Registering new user..."
register_response=$(curl -s -X POST "$API_URL/realm/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

if echo "$register_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Registration successful${NC}"
  echo "$register_response" | jq '.'
else
  echo -e "${RED}✗ Registration failed${NC}"
  echo "$register_response" | jq '.'
  exit 1
fi
echo ""

# Login
echo "Logging in..."
login_response=$(curl -s -X POST "$API_URL/realm/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}")

if echo "$login_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Login successful${NC}"
  ACCESS_TOKEN=$(echo "$login_response" | jq -r '.data.accessToken')
  REFRESH_TOKEN=$(echo "$login_response" | jq -r '.data.refreshToken')
  USER_ID=$(echo "$login_response" | jq -r '.data.user.userId')
  echo "User ID: $USER_ID"
  echo "Access Token: ${ACCESS_TOKEN:0:50}..."
  echo ""
else
  echo -e "${RED}✗ Login failed${NC}"
  echo "$login_response" | jq '.'
  exit 1
fi

echo "4️⃣  Testing Profile Endpoints"
echo "------------------------------"

# Get Profile
echo "Getting profile..."
profile_response=$(curl -s -X GET "$API_URL/realm/profiles/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN")

if echo "$profile_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Profile retrieved${NC}"
  echo "$profile_response" | jq '.'
  PROFILE_ID=$(echo "$profile_response" | jq -r '.data.id')
else
  echo -e "${RED}✗ Profile retrieval failed${NC}"
  echo "$profile_response" | jq '.'
fi
echo ""

# Update Profile
echo "Updating profile..."
update_response=$(curl -s -X PUT "$API_URL/realm/profiles/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "artistName": "Test Musician",
    "firstName": "John",
    "lastName": "Doe",
    "age": 25,
    "city": "Los Angeles",
    "bio": "This is a test profile created by the quick start script."
  }')

if echo "$update_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Profile updated${NC}"
  echo "$update_response" | jq '.data | {artistName, firstName, lastName, city}'
else
  echo -e "${RED}✗ Profile update failed${NC}"
  echo "$update_response" | jq '.'
fi
echo ""

echo "5️⃣  Testing Announcement Endpoints"
echo "------------------------------------"

# Create Announcement
echo "Creating announcement..."
announcement_response=$(curl -s -X POST "$API_URL/realm/announcements/" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Looking for a bassist - Test",
    "description": "Test announcement created by quick start script. We are looking for an experienced bassist for our rock band.",
    "city": "Los Angeles",
    "isRemote": false,
    "isCoverBand": false
  }')

if echo "$announcement_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Announcement created${NC}"
  ANNOUNCEMENT_ID=$(echo "$announcement_response" | jq -r '.data.id')
  echo "Announcement ID: $ANNOUNCEMENT_ID"
  echo "$announcement_response" | jq '.data | {id, title, city}'
else
  echo -e "${RED}✗ Announcement creation failed${NC}"
  echo "$announcement_response" | jq '.'
  exit 1
fi
echo ""

# Search Announcements
echo "Searching announcements..."
search_response=$(curl -s -X GET "$API_URL/realm/announcements/search?city=Los%20Angeles&page=1&pageSize=5")

if echo "$search_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Search successful${NC}"
  count=$(echo "$search_response" | jq '.data.announcements | length')
  echo "Found $count announcements"
  echo "$search_response" | jq '.data.announcements[0] | {id, title, city}'
else
  echo -e "${RED}✗ Search failed${NC}"
  echo "$search_response" | jq '.'
fi
echo ""

# React to Announcement
if [ ! -z "$ANNOUNCEMENT_ID" ]; then
  echo "Reacting to announcement..."
  react_response=$(curl -s -X POST "$API_URL/realm/announcements/$ANNOUNCEMENT_ID/react" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reactionType": "like"}')
  
  if echo "$react_response" | jq -e '.success' > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Reaction recorded${NC}"
    echo "$react_response" | jq '.'
  else
    echo -e "${RED}✗ Reaction failed${NC}"
    echo "$react_response" | jq '.'
  fi
  echo ""
fi

echo "6️⃣  Testing Token Refresh"
echo "--------------------------"

# Refresh Token
echo "Refreshing access token..."
refresh_response=$(curl -s -X POST "$API_URL/realm/auth/refresh-token" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

if echo "$refresh_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Token refresh successful${NC}"
  NEW_ACCESS_TOKEN=$(echo "$refresh_response" | jq -r '.data.accessToken')
  echo "New Access Token: ${NEW_ACCESS_TOKEN:0:50}..."
else
  echo -e "${RED}✗ Token refresh failed${NC}"
  echo "$refresh_response" | jq '.'
fi
echo ""

echo "7️⃣  Testing Logout"
echo "------------------"

# Logout
echo "Logging out..."
logout_response=$(curl -s -X POST "$API_URL/realm/auth/logout" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"$REFRESH_TOKEN\"}")

if echo "$logout_response" | jq -e '.success' > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Logout successful${NC}"
  echo "$logout_response" | jq '.'
else
  echo -e "${RED}✗ Logout failed${NC}"
  echo "$logout_response" | jq '.'
fi
echo ""

echo "=========================================="
echo -e "${GREEN}✓ All tests completed!${NC}"
echo ""
echo "Summary:"
echo "- User registered: $TEST_EMAIL"
echo "- User ID: $USER_ID"
echo "- Profile created and updated"
echo "- Announcement created: $ANNOUNCEMENT_ID"
echo "- Token refreshed"
echo "- User logged out"
echo ""
echo "You can now:"
echo "1. Login again with the same credentials"
echo "2. View the announcement in search results"
echo "3. Update your profile with more information"
echo ""
echo "API Documentation: See README.md and API.md"
