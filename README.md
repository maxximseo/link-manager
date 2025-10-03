# 🚀 WordPress Link Manager

A powerful Node.js/Express application with modular architecture for managing SEO link placements on WordPress sites.

## 📋 Features

- ✅ **Project Management** - Organize your SEO campaigns
- ✅ **Site Management** - Track multiple WordPress sites with quota limits
- ✅ **Link Placement** - Smart quota management system
- ✅ **Article Management** - Content publishing capabilities
- ✅ **JWT Authentication** - Secure token-based auth
- ✅ **Rate Limiting** - 5-tier protection system
- ✅ **PostgreSQL Database** - Robust data persistence
- ✅ **Modular Frontend** - 8 independent JavaScript modules
- ✅ **WordPress Plugin** - Easy integration with WP sites
- ✅ **Background Workers** - Optional Redis/Bull queue support

## 🏗️ Architecture

### Backend (Node.js/Express)
- **LEVER Pattern** - BaseService inheritance for DRY code
- **Models** - Direct PostgreSQL pool access
- **Services** - Business logic layer
- **Controllers** - HTTP request handling
- **Routes** - RESTful API endpoints
- **Middleware** - Auth, error handling, rate limiting
- **Workers** - Background job processing (optional)

### Frontend (Vanilla JS)
- **Core** - Utils, API client, app initialization
- **Components** - Notifications, modals, pagination
- **Modules** - Projects, sites, placements, articles, etc.

## 📦 Requirements

- **Node.js** 16+
- **PostgreSQL** 12+
- **Redis** (optional, for background workers)

## ⚡ Quick Start

### 1. Automatic Setup (Recommended)

```bash
./setup.sh
```

This script will:
- ✓ Check requirements
- ✓ Install npm dependencies
- ✓ Create database and tables
- ✓ Generate admin password hash
- ✓ Seed test data
- ✓ Start the server
- ✓ Test API endpoints

### 2. Manual Setup

```bash
# Install dependencies
npm install

# Create database
createdb linkmanager

# Generate admin password hash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin123', 10).then(h => console.log(h))"

# Update database/seed.sql with the hash, then:
psql -d linkmanager -f database/init.sql
psql -d linkmanager -f database/seed.sql

# Start server
npm start
```

## 🔐 Default Credentials

- **Username:** `admin`
- **Password:** `admin123`

**⚠️ Change these in production!**

## 🌐 Endpoints

### Authentication
```
POST /api/auth/login       - Login with username/password
POST /api/auth/register    - Register new user
```

### Projects
```
GET    /api/projects           - List all projects
POST   /api/projects           - Create project
PUT    /api/projects/:id       - Update project
DELETE /api/projects/:id       - Delete project
GET    /api/projects/:id/links - Get project links
POST   /api/projects/:id/links - Add link to project
```

### Sites
```
GET    /api/sites        - List all sites
POST   /api/sites        - Create site
PUT    /api/sites/:id    - Update site
DELETE /api/sites/:id    - Delete site
```

### Placements
```
GET    /api/placements     - List all placements
POST   /api/placements     - Create placement (checks quotas)
DELETE /api/placements/:id - Delete placement (frees quotas)
```

### Health Check
```
GET /api/health - Server status
```

## 🔧 Environment Variables

```env
NODE_ENV=development
PORT=3003
DATABASE_URL=postgresql://localhost/linkmanager
JWT_SECRET=your-secret-key-min-32-characters
CORS_ORIGINS=http://localhost:3000,http://localhost:3003
BCRYPT_ROUNDS=8
REDIS_URL=redis://127.0.0.1:6379  # Optional
```

## 📊 Database Schema

### Tables
1. **users** - User accounts with roles
2. **projects** - SEO campaign containers
3. **sites** - WordPress sites with quotas
4. **project_links** - Links to be placed
5. **project_articles** - Articles for publishing
6. **placements** - Placement records
7. **placement_content** - Links/articles in placements

### Key Features
- CASCADE deletes for data integrity
- Quota tracking (max_links, used_links, max_articles, used_articles)
- Indexed foreign keys for performance
- Timestamp tracking (created_at, updated_at)

## 🔌 WordPress Plugin

Copy `wordpress-plugin/link-manager-widget.php` to your WordPress plugins directory.

### Usage

```php
// In your theme or post:
[lm_links project="1" limit="10" cache="3600"]
```

### Settings
- Go to **Settings > Link Manager** in WP admin
- Copy the API key
- Add it to your site in the Link Manager app

## 🎨 Frontend Modules

### Implemented
- ✅ **projects.js** - Full CRUD for projects
- ✅ **sites.js** - Full CRUD for sites with quota display

### Placeholders (ready for expansion)
- 📦 **placements.js** - Placement management UI
- 📦 **articles.js** - Article editor
- 📦 **bulk-links.js** - Bulk link import
- 📦 **export.js** - Data export functionality
- 📦 **queue.js** - Background job monitoring
- 📦 **wordpress.js** - WordPress API integration

## 🛡️ Security Features

- ✅ **JWT tokens** (7-day expiry, no DB lookups in middleware)
- ✅ **Bcrypt hashing** (8 rounds dev, 10 rounds prod)
- ✅ **Rate limiting** (5 tiers: login, API, create, placement, WordPress)
- ✅ **SQL injection protection** (parameterized queries)
- ✅ **CORS configuration**
- ✅ **SSL support** (auto-detected for DigitalOcean)

## ⚡ Performance Optimizations

- **Connection pooling** (25 max connections)
- **Bcrypt warmup** (on server start)
- **Pagination** (default 20, max 100 items)
- **Redis caching** (optional, graceful fallback)
- **Modular frontend** (load only what you need)

## 📝 Development Scripts

```bash
npm run dev           # Development with nodemon
npm start            # Production mode
npm run start:modular # Same as npm start
```

## 🐛 Troubleshooting

### Database connection fails
```bash
# Check PostgreSQL is running
psql -d linkmanager -c "SELECT NOW();"

# Recreate database
dropdb linkmanager && createdb linkmanager
psql -d linkmanager -f database/init.sql
psql -d linkmanager -f database/seed.sql
```

### Port already in use
```bash
# Find and kill process on port 3003
lsof -ti:3003 | xargs kill -9
```

### Login fails
```bash
# Regenerate admin hash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin123', 10).then(h => console.log(h))"

# Update database
psql -d linkmanager -c "UPDATE users SET password_hash='<new_hash>' WHERE username='admin';"
```

## 📁 Project Structure

```
/
├── backend/
│   ├── config/          # Database, logger, constants, bcrypt, queue
│   ├── middleware/      # Auth, error handler, rate limiter
│   ├── models/          # User, Project, Site, Placement
│   ├── services/        # Base service + LEVER pattern
│   ├── controllers/     # HTTP request handlers
│   ├── routes/          # API endpoint definitions
│   ├── workers/         # Background job processing
│   ├── utils/           # Error handling, pagination
│   ├── build/           # Frontend static files
│   │   ├── css/
│   │   ├── js/
│   │   │   ├── core/
│   │   │   ├── components/
│   │   │   └── modules/
│   │   └── index.html
│   ├── app.js           # Express app factory
│   └── server-new.js    # Server entry point
├── database/
│   ├── init.sql         # Schema definition
│   └── seed.sql         # Test data
├── wordpress-plugin/
│   └── link-manager-widget.php
├── .env                 # Environment variables
├── .gitignore
├── package.json
├── setup.sh             # Automated setup script
└── README.md
```

## 🚀 Production Deployment

### DigitalOcean / Heroku

1. Set environment variables:
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=<strong-32-char-secret>
BCRYPT_ROUNDS=10
```

2. SSL is auto-detected for DigitalOcean domains

3. Build and start:
```bash
npm install --production
npm start
```

### Docker (Coming Soon)
```bash
docker-compose up
```

## 📚 API Authentication

All protected endpoints require a Bearer token:

```bash
# Login
TOKEN=$(curl -X POST http://localhost:3003/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' \
  | jq -r '.token')

# Use token
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3003/api/projects
```

## 🤝 Contributing

This is a modular architecture - easy to extend:

1. **Add new model:** Create in `backend/models/`
2. **Add new service:** Extend `BaseService` in `backend/services/`
3. **Add new routes:** Create in `backend/routes/`
4. **Add frontend module:** Create in `backend/build/js/modules/`

## 📄 License

MIT License - Free to use and modify

## 🎯 Roadmap

- [ ] Complete all frontend modules
- [ ] Bulk import/export functionality
- [ ] WordPress API direct integration
- [ ] Real-time notifications
- [ ] Analytics dashboard
- [ ] Docker support
- [ ] API documentation (Swagger)
- [ ] Unit tests
- [ ] E2E tests

## 🆘 Support

Open an issue on GitHub or contact the maintainers.

---

**Built with ❤️ using Node.js, Express, PostgreSQL, and Vanilla JavaScript**
