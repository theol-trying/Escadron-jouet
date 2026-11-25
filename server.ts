import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from './server/roomManager';
import type { ClientToServerEvents, ServerToClientEvents } from './shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Public address of the site, for the absolute links of the preview tags: APP_URL if set (custom
 * domain), else Render's address, else the address the page was requested from. The host header is
 * checked so a forged request cannot slip markup into the page.
 */
function publicOrigin(req: express.Request): string {
  const configured = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').split(',')[0].trim();
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(configured)) return configured.replace(/\/$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return '';
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim() === 'https' ? 'https' : 'http';
  return `${proto}://${host}`;
}

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--prod');
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN || process.env.APP_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
          return callback(null, true);
        }
        if (allowedOrigins.has(origin)) {
          return callback(null, true);
        }
        if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) {
          return callback(null, true);
        }
        callback(null, false);
      },
      methods: ['GET', 'POST'],
    },
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, true);
      if (!isProd && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      if (allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      if (process.env.RENDER_EXTERNAL_URL && origin === process.env.RENDER_EXTERNAL_URL) {
        return callback(null, true);
      }
      // Always allow same-origin requests behind reverse proxies (Render, Cloud Run, preview)
      const hostHeader = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      try {
        const originHost = new URL(origin).host;
        if (hostHeader && originHost === hostHeader) {
          return callback(null, true);
        }
      } catch {
        // invalid origin URL
      }
      return callback('Origine non autorisée', false);
    },
    transports: ['websocket', 'polling'],
  });

  const roomManager = new RoomManager(io);
  io.on('connection', (socket) => {
    roomManager.handleConnection(socket);
  });

  app.get('/healthz', (_req, res) => {
    res.status(200).json({
      ok: true,
      rooms: roomManager.getRoomCount(),
      uptime: Math.round(process.uptime()),
    });
  });

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // When bundled to dist-server/server.js, dist/ is at ../dist
    const candidateDist = path.resolve(__dirname, 'dist');
    const parentDist = path.resolve(__dirname, '../dist');
    const fs = await import('node:fs');
    const distPath = fs.existsSync(candidateDist) ? candidateDist : parentDist;

    // index.html: link previews (Discord, WhatsApp, Messenger…) need absolute addresses, so the
    // __ORIGIN__ placeholders are filled with the public address of the site. Never cached, so a new
    // deploy is picked up at once.
    const indexTemplate = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
    const sendIndex = (req: express.Request, res: express.Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.type('html').send(indexTemplate.replaceAll('__ORIGIN__', publicOrigin(req)));
    };
    app.get('/index.html', sendIndex);
    // Built scripts and styles carry a content hash in their name: they never change, keep them a year
    app.use(
      '/assets',
      express.static(path.join(distPath, 'assets'), { immutable: true, maxAge: '365d', index: false, fallthrough: false })
    );
    // Other files (preview image, music…) are revalidated on each visit (ETag)
    app.use(express.static(distPath, { index: false }));
    // Any other address (client-side routes, ?salon=CODE…) gets the page (Express 5 wildcard syntax)
    app.get('/{*splat}', sendIndex);
  }

  const port = Number(process.env.PORT) || 3000;
  server.listen(port, '0.0.0.0', () => {
    console.log(`[Escadrille Jouet] Serveur prêt sur http://0.0.0.0:${port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
