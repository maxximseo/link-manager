# WordPress Link Manager

SEO-focused link and content placement system for WordPress sites with comprehensive metrics tracking.

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- PostgreSQL database
- WordPress site (for plugin integration)

### Installation

1. **Clone and setup backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your database credentials
```

2. **Configure database connection:**
Edit `.env` file:
```env
DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
JWT_SECRET=your-secret-key-min-32-chars
PORT=3002
NODE_ENV=development
```

3. **Start the server:**
```bash
npm run dev  # Development with auto-restart
# or
npm start    # Production mode
```

4. **Access the application:**
- Frontend: http://localhost:3002
- API: http://localhost:3002/api
- Default login: admin / admin123

## 📁 Project Structure

```
link-manager/
├── backend/
│   ├── server.js              # Main server (~1700 lines)
│   ├── build/
│   │   └── index.html        # Complete UI (~2800 lines)
│   ├── ca-certificate.crt     # PostgreSQL SSL certificate
│   ├── package.json           # Dependencies
│   └── .env.example          # Configuration template
├── wordpress-plugin/
│   └── link-manager-widget/  # WordPress plugin v2.2.2
├── deployment/
│   └── app.yaml             # DigitalOcean deployment config
└── CLAUDE.md               # Development guidelines
```

## 🔑 Key Features

- **Link Management**: Track and manage external links across multiple WordPress sites
- **Article Publishing**: Create and publish SEO-optimized articles directly to WordPress
- **Placement Tracking**: Monitor where content is placed and track performance
- **Quota Management**: Control link and article limits per site
- **SEO Metrics**: Built-in metrics tracking for all placements
- **Rate Limiting**: Multi-tier API protection
- **WordPress Integration**: Native plugin for seamless content publishing

## 🛠️ Development

### Development Notes
The main server file `backend/server.js` contains all backend logic in a single file following LEVER optimization principles.

### Database Schema
- 7 PostgreSQL tables
- Optimized with CTEs for 70% reduction in queries
- Automatic quota tracking via triggers

### API Endpoints
- Backward-compatible pagination
- JWT authentication
- Rate limiting by endpoint tier
- Full CRUD for projects, sites, links, articles, placements

## 🚢 Deployment

### DigitalOcean App Platform
1. Push to `main` branch
2. Auto-deploys in 2-5 minutes
3. Monitor at: https://cloud.digitalocean.com/apps

### Environment Variables (Production)
Set in DigitalOcean dashboard:
- `NODE_ENV=production`
- `PORT=8080`
- `JWT_SECRET` (32+ characters)
- `DATABASE_URL` (managed by DO)

## 🔌 WordPress Plugin

### Installation
1. Upload `wordpress-plugin/link-manager-widget/` to WordPress `/wp-content/plugins/`
2. Activate in WordPress admin
3. Configure API key in plugin settings
4. Test connection to verify setup

### Features
- Auto-publish articles with SEO metadata
- Custom HTML support via Quill editor
- API key authentication
- 5-minute cache for performance

## 📊 Production URL
https://shark-app-9kv6u.ondigitalocean.app

## 🔧 Troubleshooting

### Common Issues
- **"Test Connection" fails**: Check API key matches between WordPress and database
- **Articles not publishing**: Ensure plugin version is 2.2.2+
- **Database connection fails**: Verify SSL certificate path and credentials
- **Deployment fails**: Ensure file pairs are synchronized

### Debug Commands
```bash
# Check API health
curl https://shark-app-9kv6u.ondigitalocean.app/api/health

# Test WordPress endpoint
curl -X POST https://shark-app-9kv6u.ondigitalocean.app/api/wordpress/verify \
  -H "Content-Type: application/json" \
  -d '{"api_key":"your-api-key"}'
```

## 📝 License
MIT

## 🤝 Support
For detailed development guidelines, see [CLAUDE.md](./CLAUDE.md)