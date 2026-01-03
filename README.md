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

## Documentation

See `/docs` directory for API documentation.

