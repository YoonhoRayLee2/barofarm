import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';

import liveRoutes, { createLiveRouter } from './routes/live';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import { createFavoritesRouter } from './routes/favorites';
import productsRouter from './routes/products';
import registerAuctionSocket from './socket/auction';
import pool from './db/mysql';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// LiveKit WebView HTML (live-seller.html / live-buyer.html) 정적 서빙
app.use('/live', express.static(path.join(__dirname, '..', 'public')));

// SPA 웹앱 정적 서빙 (개발: WebView 캐시 무효화)
app.use(
  '/app',
  express.static(path.join(__dirname, '..', 'public', 'web'), {
    etag: false,
    lastModified: false,
    cacheControl: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  }),
);

// SPA history fallback — 파일 확장자가 없는 /app/* 경로는 index.html 반환
app.get('/app/*', (req, res, next) => {
  if (req.path.includes('.')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'web', 'index.html'));
});

// 업로드 파일 정적 서빙 (/uploads/auctions/{id}.jpg)
app.use('/uploads', express.static(path.join(__dirname, '..', 'public', 'uploads')));

// /api/live/token — 기존 호환 유지
app.use('/api/live', liveRoutes);

// /api/lives — Live/Auction 통합 라우터
app.use('/api/lives', createLiveRouter(io));

// [deprecated] 기존 단순 upsert 라우트 — 하위 호환 유지
app.use('/api/users', userRoutes);
// JWT 기반 인증 라우트
app.use('/api/auth', authRoutes);
app.use('/api/favorites', createFavoritesRouter(io, pool));
app.use('/api/products', productsRouter);

registerAuctionSocket(io);

if (!process.env.JWT_SECRET) {
  console.warn('[auth] JWT_SECRET not set — using insecure default');
}

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`Barofarm server running on http://${HOST}:${PORT}`);
  console.log(`  → LAN devices can connect via http://<this-mac-ip>:${PORT}`);
  const missingEnv = ['LIVEKIT_KEY', 'LIVEKIT_SECRET', 'LIVEKIT_URL'].filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    console.warn(`[startup] LiveKit 환경변수 미설정: ${missingEnv.join(', ')} — 라이브 기능이 동작하지 않습니다.`);
  }
});
