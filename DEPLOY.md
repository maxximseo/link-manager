# Deployment Guide for DigitalOcean App Platform

## Quick Deploy

1. **Go to DigitalOcean App Platform**
   - https://cloud.digitalocean.com/apps

2. **Create New App**
   - Click "Create App"
   - Choose "GitHub" as source
   - Select repository: `maxximseo/link-manager`
   - Branch: `main`

3. **App Configuration**
   - DigitalOcean will auto-detect Node.js app
   - It will use the `app.yaml` configuration

4. **Environment Variables**
   Add these in App Settings → Environment Variables:
   ```
   DB_PASSWORD=<your-database-password>
   JWT_SECRET=<generate-secure-32-char-secret>
   ```
   Note: Get the actual DB_PASSWORD from your DigitalOcean database settings

5. **Deploy**
   - Click "Next" → "Create Resources"
   - Wait for deployment (3-5 minutes)

## Repository Structure
```
/
├── package.json          # Node.js dependencies
├── start.js             # Entry point for production
├── app.yaml             # DigitalOcean configuration
├── backend/
│   ├── server-simple.js # Main server file
│   ├── .env            # Local environment variables (not in git)
│   └── build/
│       └── index.html  # Frontend UI
└── README.md
```

## Local Development
```bash
# Install dependencies
npm install

# Create .env file in backend/
cp backend/.env.example backend/.env
# Edit .env with your database credentials

# Run locally
npm run dev
```

## Production URL
After deployment, your app will be available at:
```
https://linkmanager-app-[random].ondigitalocean.app
```

## Database
- PostgreSQL 17
- Host: db-postgresql-nyc3-90526-do-user-24010108-0.j.db.ondigitalocean.com
- Port: 25060
- Database: linkmanager
- User: doadmin

## Support
For issues, check:
- App Platform Logs in DigitalOcean dashboard
- Runtime Logs for errors
- Build Logs for deployment issues