# Complete Setup Guide - Wazuh Security Operations Center

This guide walks you through setting up and running the entire application (frontend + backend proxy).

## Architecture Overview

\`\`\`
Browser (http://localhost:5173)
    ↓
Frontend (React/Vite)
    ↓
Backend Proxy (http://localhost:3001)
    ↓
Wazuh API (https://61.0.171.101:55000)
    ↓
Wazuh Server & Agents
\`\`\`

## Prerequisites

- Node.js v16+ installed
- npm or yarn package manager
- Wazuh server running at `https://61.0.171.101:55000`
- Wazuh credentials: `wazuh-wui` / `p8fkI3T3i.zfQM3qNGM.0Gg.4I+A0YJA`

## Step 1: Setup Backend Proxy

1. Navigate to backend directory:
\`\`\`bash
cd updated/vigilant-watch-eye-34663-main/backend
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Create `.env` file:
\`\`\`bash
cp .env.example .env
\`\`\`

4. Start the backend server:
\`\`\`bash
npm run dev
\`\`\`

You should see:
\`\`\`
Backend proxy server running on http://localhost:3001
\`\`\`

**Keep this terminal open!**

## Step 2: Setup Frontend

1. Open a new terminal and navigate to frontend directory:
\`\`\`bash
cd updated/vigilant-watch-eye-34663-main
\`\`\`

2. Install dependencies:
\`\`\`bash
npm install
\`\`\`

3. Start the development server:
\`\`\`bash
npm run dev
\`\`\`

You should see:
\`\`\`
VITE v5.4.19  ready in 123 ms

➜  Local:   http://localhost:5173/
\`\`\`

## Step 3: Access the Application

1. Open your browser and go to: `http://localhost:5173`

2. You should see the login page with:
   - Username field
   - Password field
   - Login button

3. Enter your Wazuh credentials:
   - **Username:** `wazuh-wui`
   - **Password:** `p8fkI3T3i.zfQM3qNGM.0Gg.4I+A0YJA`

4. Click Login

5. You should be redirected to the dashboard showing:
   - Real-time metrics
   - Active agents
   - Security alerts
   - Event logs
   - Network topology

## Troubleshooting

### Backend won't start
- Check if port 3001 is already in use: `lsof -i :3001`
- Ensure Node.js is installed: `node --version`
- Check `.env` file exists and has correct Wazuh API URL

### Frontend won't start
- Check if port 5173 is already in use: `lsof -i :5173`
- Delete `node_modules` and `package-lock.json`, then run `npm install` again
- Clear browser cache (Ctrl+Shift+Delete)

### Login fails
- Verify Wazuh credentials are correct
- Check backend is running on port 3001
- Check browser console for error messages (F12)
- Ensure Wazuh API is accessible at `https://61.0.171.101:55000`

### No data showing on dashboard
- Verify you're logged in successfully
- Check browser console for API errors
- Ensure you have agents connected to your Wazuh server
- Check backend logs for proxy errors

### CORS errors
- These should be resolved by using the backend proxy
- If still occurring, check backend is running and accessible

## Available Commands

### Frontend
\`\`\`bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
\`\`\`

### Backend
\`\`\`bash
npm run dev      # Start development server with auto-reload
npm run build    # Build TypeScript to JavaScript
npm start        # Run production build
\`\`\`

## Production Deployment

For production deployment:

1. **Backend**: Deploy to a server (Heroku, AWS, DigitalOcean, etc.)
   - Update `WAZUH_API_URL` environment variable
   - Use a proper session store (Redis, database)
   - Enable HTTPS
   - Add rate limiting and request validation

2. **Frontend**: Deploy to a CDN (Vercel, Netlify, etc.)
   - Update API base URL to production backend
   - Build: `npm run build`
   - Deploy the `dist` folder

## Security Considerations

- Never commit `.env` files with real credentials
- Use environment variables for all sensitive data
- In production, implement proper authentication and authorization
- Add request validation and sanitization
- Use HTTPS for all communications
- Implement rate limiting on the backend
- Consider adding API key authentication for additional security

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console (F12) for error messages
3. Check backend logs for proxy errors
4. Verify Wazuh server is running and accessible
