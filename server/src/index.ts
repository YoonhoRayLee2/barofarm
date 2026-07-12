import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import liveRoutes, { createLiveRouter } from './routes/live';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import { createFavoritesRouter } from './routes/favorites';
import { createProductsRouter } from './routes/products';
import auctionRouter from './routes/auctions';
import trackingRouter from './routes/tracking';
import chatRoomsRouter from './routes/chat-rooms';
import consignmentsRouter from './routes/consignments';
import deliveryAddressesRouter from './routes/delivery-addresses';
import paymentMethodsRouter from './routes/payment-methods';
import paymentCredentialsRouter from './routes/payment-credentials';
import paymentAuthRouter from './routes/payment-auth';
import refundsRouter from './routes/refunds';
import marketPricesRouter from './routes/market-prices';
import hanaroStoresRouter from './routes/hanaro-stores';
import createAdminRouter from './routes/admin';
import { createGroupDealsRouter } from './routes/group-deals';
import recommendationsRouter from './routes/recommendations';
import timelinesRouter from './routes/timelines';
import notificationsRouter from './routes/notifications';
import { createWishlistRouter } from './routes/wishlist';
import searchRouter from './routes/search';
import reviewsRouter from './routes/reviews';
import registerAuctionSocket from './socket/auction';
import registerChatSocket from './socket/chat';
import pool from './db/mysql';
import { verifyToken } from './services/jwt';

if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set');
  process.exit(1);
}

const app = express();
// 리버스 프록시(ALB/Nginx) 1홉 신뢰 — X-Forwarded-For 위조 방지
app.set('trust proxy', 1);
const server = http.createServer(app);

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : null; // null = 모든 origin 허용 (미설정 시 개방)

const corsOrigin = allowedOrigins
  ? (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    }
  : true;

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
});

// handshake JWT 검증 — 인증된 userId만 socket.data.userId에 저장한다.
// 토큰이 없거나 무효해도 연결은 허용(비로그인 소켓 기능 보호); 이 경우 socket.data.userId는 미설정.
// user:identify 핸들러(chat.ts, auction.ts)가 이 값만 신뢰해 개인 룸에 조인해야 도청을 막을 수 있다.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (typeof token === 'string' && token) {
    const payload = verifyToken(token);
    if (payload) {
      socket.data.userId = payload.userId;
    }
  }
  next();
});

// 보안 헤더 — CSP는 SPA/inline script·style 및 LiveKit을 깨뜨릴 수 있어 비활성화(별도 튜닝 작업으로 분리).
// crossOriginResourcePolicy/crossOriginEmbedderPolicy는 /uploads 이미지·LiveKit 리소스가
// 다른 origin(Flutter WebView 등)에서 로드될 수 있어 완화.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// 전역 API rate limit — 정상 SPA 사용(홈 진입 시 병렬 API 호출)은 통과, 스크래핑/무차별만 차단.
// /api 하위 라우트에만 적용되며 auth.ts의 authLimiter(더 엄격)는 그 위에 별도로 얹힌다.
// Socket.io(/socket.io)와 정적 자산(/app, /live, /uploads)은 실시간 연결·이미지 로드가
// 걸리면 안 되므로 제외.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

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

app.get('/', (req, res) => {
  res.redirect('/app/home');
});

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
app.use('/api/products', createProductsRouter(io));
app.use('/api/auctions', auctionRouter);
app.use('/api/tracking', trackingRouter);
app.use('/api/chat-rooms', chatRoomsRouter);
app.use('/api/consignments', consignmentsRouter);
app.use('/api/delivery-addresses', deliveryAddressesRouter);
app.use('/api/payment-methods', paymentMethodsRouter);
app.use('/api/payment-credentials', paymentCredentialsRouter);
app.use('/api/payment-auth', paymentAuthRouter);
app.use('/api/refunds', refundsRouter);
app.use('/api/market-prices', marketPricesRouter);
app.use('/api/hanaro-stores', hanaroStoresRouter);
app.use('/admin', createAdminRouter(io));
app.use('/api/group-deals', createGroupDealsRouter(io));
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/timelines', timelinesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/wishlist', createWishlistRouter(pool));
app.use('/api/search', searchRouter);
app.use('/api/reviews', reviewsRouter);

registerAuctionSocket(io);
registerChatSocket(io);

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
