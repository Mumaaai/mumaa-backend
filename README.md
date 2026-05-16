# MUMAA AI - Backend API

The serverless backend for the MUMAA AI ecosystem, built on Cloudflare Workers and D1.

## 🚀 Infrastructure
- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1 (SQLite)
- **Auth**: Google OAuth Token Verification

## 📡 API Endpoints
- `POST /auth/google`: Verify Google ID tokens and manage user accounts.
- `GET /chat/history/:userId`: Retrieve message history for a specific user.
- `POST /chat/message`: Save new chat messages.
- `POST /logs/activity`: Log feeding, sleep, and diaper events.

## 🛠 Setup & Deployment

### 1. Configure Wrangler
Set `GOOGLE_CLIENT_ID` via Cloudflare Workers environment settings or a local `.dev.vars` file.

For local development:
```bash
cp .dev.vars.example .dev.vars
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Initialize Database
Run the schema migration against your D1 instance:
```bash
npx wrangler d1 execute muma --file=../database/schema.sql --remote
```

### 4. Deploy
```bash
npx wrangler deploy
```

## 🔒 Security
- CORS is enabled for the MUMAA frontend.
- Google tokens are verified via Google's OAuth2 tokeninfo endpoint.
- D1 bindings are used for secure database access.