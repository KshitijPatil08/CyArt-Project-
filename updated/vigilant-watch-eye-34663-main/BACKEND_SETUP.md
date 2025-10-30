# Backend Proxy Server Setup

This backend proxy server handles communication between the frontend and the Wazuh API, solving CORS issues and providing a secure authentication layer.

## Prerequisites

- Node.js v16+ installed
- npm or yarn package manager

## Installation

1. Navigate to the backend directory:
\`\`\`bash
cd backend
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Create a `.env` file from the example:
\`\`\`bash
cp .env.example .env
\`\`\`

4. Update `.env` with your Wazuh API URL (if different from default):
\`\`\`
WAZUH_API_URL=https://61.0.171.101:55000
PORT=3001
\`\`\`

## Running the Backend

### Development Mode
\`\`\`bash
npm run dev
\`\`\`

The server will start on `http://localhost:3001` and watch for file changes.

### Production Mode
\`\`\`bash
npm run build
npm start
\`\`\`

## How It Works

1. **Authentication**: Frontend sends login credentials to `/api/auth/login`
2. **Token Exchange**: Backend authenticates with Wazuh API and returns a JWT token
3. **API Proxy**: Frontend sends requests to `/api/*` with the JWT token
4. **Wazuh Communication**: Backend proxies requests to Wazuh API with proper authentication

## API Endpoints

### POST /api/auth/login
Authenticate with Wazuh credentials

**Request:**
\`\`\`json
{
  "username": "wazuh-wui",
  "password": "your-password"
}
\`\`\`

**Response:**
\`\`\`json
{
  "data": {
    "token": "jwt-token-here"
  }
}
\`\`\`

### GET /api/*
Proxy any Wazuh API endpoint

**Headers:**
\`\`\`
Authorization: Bearer <jwt-token>
\`\`\`

## Troubleshooting

- **Connection refused**: Ensure Wazuh API is running and accessible
- **SSL certificate errors**: The backend ignores self-signed certificates (for development)
- **CORS errors**: Should be resolved by using the backend proxy

## Security Notes

- In production, use environment variables for sensitive data
- Consider implementing rate limiting
- Add request validation and sanitization
- Use a proper session/token store (Redis, database) instead of in-memory Map
