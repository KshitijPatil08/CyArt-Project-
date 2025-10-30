# Device Tracking System - Deployment Guide

## Prerequisites

- Vercel account
- Supabase account
- Node.js 18+

## Step 1: Setup Supabase

1. Create a new Supabase project
2. Go to SQL Editor and run the migration scripts:
   - `scripts/01-init-schema.sql` - Creates all tables and indexes
   - `scripts/02-setup-auth.sql` - Sets up authentication and RLS policies

3. Get your credentials:
   - Go to Settings → API
   - Copy `Project URL` and `Anon Key`

## Step 2: Deploy to Vercel

1. Push your code to GitHub
2. Go to vercel.com and create a new project
3. Connect your GitHub repository
4. Add environment variables:
   \`\`\`
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   \`\`\`
5. Deploy

## Step 3: Setup Authentication

1. In Supabase, go to Authentication → Providers
2. Enable Email provider
3. Configure email templates if needed

## Step 4: Create First User

1. Go to your deployed app: `https://your-app.vercel.app/auth/sign-up`
2. Create an account
3. Verify your email
4. Sign in

## Step 5: Install Agents

### Windows Agent

\`\`\`powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Download and run the agent
$ApiUrl = "https://your-app.vercel.app"
$DeviceName = $env:COMPUTERNAME
$Owner = $env:USERNAME
$Location = "Office"

# Run the agent
.\scripts\windows-agent.ps1 -ApiUrl $ApiUrl -DeviceName $DeviceName -Owner $Owner -Location $Location
