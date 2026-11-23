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

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
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

  const isProd = process.env.NODE_ENV === 'production';

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
    const distPath = (await import('node:fs')).existsSync(candidateDist)
      ? candidateDist
      : parentDist;

    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
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
