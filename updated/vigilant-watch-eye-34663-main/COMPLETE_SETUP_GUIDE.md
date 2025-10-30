# Complete Setup Guide - Wazuh Security Operations Center

## Overview

This is a full-stack Security Operations Center (SOC) application that connects to your Wazuh infrastructure. Users create accounts and log in with their credentials, then view real-time security monitoring data from your Wazuh server.

**Architecture:**
- Frontend: React + Vite (User authentication & dashboard)
- Backend: Node.js + Express (User management & Wazuh API proxy)
- Database: SQLite (User accounts)
- Wazuh API: Backend uses Wazuh credentials to fetch security data

## Prerequisites

- Node.js v16+ installed
- Wazuh server running at `https://61.0.171.101:55000`
- Wazuh credentials: `wazuh-wui` / `p8fkI3T3i.zfQM3qNGM.0Gg.4I+A0YJA`

## Installation & Setup

### Step 1: Backend Setup

\`\`\`bash
cd updated/vigilant-watch-eye-34663-main/backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env and add your configuration
# WAZUH_API_URL=https://61.0.171.101:55000
# WAZUH_USERNAME=wazuh-wui
# WAZUH_PASSWORD=p8fkI3T3i.zfQM3qNGM.0Gg.4I+A0YJA
# JWT_SECRET=your-secret-key-change-in-production
# PORT=3001
\`\`\`

### Step 2: Frontend Setup

\`\`\`bash
cd updated/vigilant-watch-eye-34663-main

# Install dependencies
npm install
\`\`\`

### Step 3: Run the Application

**Terminal 1 - Start Backend:**
\`\`\`bash
cd updated/vigilant-watch-eye-34663-main/backend
npm run dev
\`\`\`

You should see:
\`\`\`
Backend server running on http://localhost:3001
\`\`\`

**Terminal 2 - Start Frontend:**
\`\`\`bash
cd updated/vigilant-watch-eye-34663-main
npm run dev
\`\`\`

You should see:
\`\`\`
VITE v5.4.19  ready in 123 ms
➜  Local:   http://localhost:5173/
\`\`\`

### Step 4: Access the Application

1. Open your browser and go to `http://localhost:5173`
2. Click "Sign up" to create a new account
3. Enter your email, username, and password
4. After registration, you'll be logged in automatically
5. You'll see the Security Operations Center dashboard with real-time data from your Wazuh server

## Features

- **User Authentication**: Sign up and login with email/username/password
- **Real-time Dashboard**: View active systems, security events, and alerts
- **Network Topology**: Visualize your network and connected agents
- **Alert Feed**: Monitor active security alerts
- **Log Viewer**: View security event logs
- **Automatic Data Refresh**: Dashboard updates every 60 seconds

## Database

The application uses SQLite for user management. The database file (`users.db`) is created automatically in the backend directory.

**User Table Schema:**
\`\`\`sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
\`\`\`

## API Endpoints

### Authentication Endpoints

**Register:**
\`\`\`
POST /api/auth/register
Body: { email, username, password, confirmPassword }
Response: { success, data: { token, user } }
\`\`\`

**Login:**
\`\`\`
POST /api/auth/login
Body: { username, password }
Response: { success, data: { token, user } }
\`\`\`

### Wazuh API Endpoints (Requires JWT Token)

All Wazuh API requests go through the backend proxy:

\`\`\`
GET /api/wazuh/agents
GET /api/wazuh/alerts
GET /api/wazuh/logs
GET /api/wazuh/manager/status
\`\`\`

Headers required:
\`\`\`
Authorization: Bearer <JWT_TOKEN>
\`\`\`

## Troubleshooting

### Backend won't start
- Check if port 3001 is already in use
- Verify Node.js is installed: `node --version`
- Check .env file has correct Wazuh credentials

### Frontend won't connect to backend
- Ensure backend is running on `http://localhost:3001`
- Check browser console for CORS errors
- Verify firewall isn't blocking localhost connections

### Login fails
- Check username and password are correct
- Verify backend is running
- Check backend logs for errors

### No data showing in dashboard
- Verify Wazuh server is running and accessible
- Check Wazuh credentials are correct in .env
- Ensure you have agents connected to your Wazuh server
- Check browser console for API errors

## Production Deployment

Before deploying to production:

1. Change `JWT_SECRET` in .env to a strong random string
2. Update `WAZUH_API_URL` to your production Wazuh server
3. Set `NODE_ENV=production`
4. Use a production database (PostgreSQL recommended)
5. Enable HTTPS for both frontend and backend
6. Set up proper CORS configuration
7. Use environment variables for sensitive data

## Support

For issues or questions, check:
- Backend logs: `npm run dev` output
- Frontend console: Browser DevTools (F12)
- Wazuh API documentation: https://documentation.wazuh.com/current/api/
