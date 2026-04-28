import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';

import liveRoutes, { createLiveRouter } from './routes/live';
import userRoutes from './routes/users';
import registerAuctionSocket from './socket/auction';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// LiveKit WebView HTML (live-seller.html / live-buyer.html) 정적 서빙
app.use('/live', express.static(path.join(__dirname, '..', 'public')));

// /api/live/token — 기존 호환 유지
app.use('/api/live', liveRoutes);

// /api/lives — Live/Auction 통합 라우터
app.use('/api/lives', createLiveRouter(io));

app.use('/api/users', userRoutes);

registerAuctionSocket(io);

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`Barofarm server running on port ${PORT}`);
  const missingEnv = ['LIVEKIT_KEY', 'LIVEKIT_SECRET', 'LIVEKIT_URL'].filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    console.warn(`[startup] LiveKit 환경변수 미설정: ${missingEnv.join(', ')} — 라이브 기능이 동작하지 않습니다.`);
  }
});
