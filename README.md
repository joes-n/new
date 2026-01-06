# VN Chat App

A/B testing platform for Visual Novel chat UI.

## Setup

1. Copy `.env.example` to `.env` in `client/` and `server/` (or root if loading from root, but usually per-service). 
   *Actually per spec, load per package as needed. Root .env.example provided.*

2. Install dependencies:
   ```bash
   npm install
   cd python
   pip install -r requirements.txt
   ```

3. Initialize DB:
   ```bash
   cd server
   npx prisma migrate dev
   ```

## Running

```bash
npm run dev
```

This starts:
- Client: http://localhost:5173
- Server: http://localhost:3000
- Python: http://localhost:8000
