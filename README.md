# ProWhey Middleware Server

Production middleware server for ProWhey mobile app.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.production.template` to `.env.production` and fill in values
3. Start server: `npm start` or `pm2 start src/server.js`

## Development

- Start with nodemon: `npm run dev`
- Run tests: `npm test`
- Lint code: `npm run lint`
- Format code: `npm run format`

## Production

- Use PM2: `pm2 start src/server.js --name prowhey-middleware`
- Monitor: `pm2 monit`
- Logs: `pm2 logs prowhey-middleware`

## Health Check

GET `/health` - Returns server status
GET `/health/sync-status` - Returns sync system status (stream lengths, last IDs)

## Sync System

The middleware includes a Redis Streams-based incremental sync system for efficient data synchronization:

- **Webhook-driven updates**: ERPNext webhooks trigger cache updates and stream notifications
- **Hash-based change detection**: Only syncs when data actually changes
- **Multi-frequency sync endpoints**: Fast (5-15 min), Medium (hourly), Slow (daily)
- **Weekly full refresh**: Automatic full sync that only adds stream entries on differences

### Sync Endpoints

- `POST /api/sync/check` - Unified sync endpoint (all entity types)
- `POST /api/sync/check-fast` - Fast-frequency entities (views, comments, user)
- `POST /api/sync/check-medium` - Medium-frequency entities (stock, notifications)
- `POST /api/sync/check-slow` - Low-frequency entities (products, prices, hero)

### Webhook Endpoints

- `POST /api/webhooks/erpnext` - Unified webhook for all entity types (product, price, stock)
- `POST /api/webhooks/price-update` - Legacy price update webhook (still supported)

### Testing Endpoints

- `GET /api/erpnext/ping` - Validate ERPNext connectivity and credentials

## Environment Variables

See `.env.example` for all configuration options. Key sync-related variables:

- `SYNC_STREAM_RETENTION_DAYS` - Days to keep stream entries (default: 7)
- `SYNC_FULL_REFRESH_DAY` - Day of week for full refresh (0-6, default: 6 = Saturday)
- `SYNC_FULL_REFRESH_HOUR` - Hour for full refresh (0-23, default: 6 = 6 AM)
- `STREAM_MAX_LENGTH` - Maximum entries per stream before trimming (default: 10000)

## Documentation

See `/docs` directory for API documentation.

