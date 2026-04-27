import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import { RowDataPacket } from 'mysql2';

import createAuctionRouter from './routes/auctions';
import liveRoutes from './routes/live';
import userRoutes from './routes/users';
import registerAuctionSocket from './socket/auction';
import db from './db/mysql';
import { auctions, createAuction, startTimer } from './store/memory';
import { endAuction } from './services/livekit-service';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// LiveKit WebView HTML (live-seller.html / live-buyer.html) 정적 서빙
app.use('/live', express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auctions', createAuctionRouter(io));
app.use('/api/live', liveRoutes);
app.use('/api/users', userRoutes);

registerAuctionSocket(io);

interface LiveAuctionRow extends RowDataPacket {
  id: number;
  seller_id: number;
  product_name: string;
  start_price: number;
  current_price: number;
  status: 'pending' | 'live' | 'ended';
}

// 서버 시작 시 DB의 status='live' 경매를 메모리 + 타이머로 자동 복원
async function bootstrapLiveAuctions(): Promise<void> {
  try {
    const [rows] = await db.query<LiveAuctionRow[]>(
      'SELECT id, seller_id, product_name, start_price, current_price, status FROM auctions WHERE status = "live"'
    );
    let loaded = 0;
    for (const row of rows) {
      const id = String(row.id);
      if (auctions.has(id)) continue;
      createAuction(id, {
        productName: row.product_name,
        startPrice: row.start_price,
        sellerId: String(row.seller_id),
      });
      startTimer(id, io, async (state) => {
        await endAuction(state);
      });
      loaded += 1;
    }
    console.log(`[bootstrap] Loaded ${loaded} live auction(s) into memory`);
  } catch (e) {
    console.error('[bootstrap] Failed to load live auctions:', (e as Error).message);
  }
}

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`Barofarm server running on port ${PORT}`);
  const missingEnv = ['LIVEKIT_KEY', 'LIVEKIT_SECRET', 'LIVEKIT_URL'].filter(k => !process.env[k]);
  if (missingEnv.length > 0) {
    console.warn(`[startup] LiveKit 환경변수 미설정: ${missingEnv.join(', ')} — 라이브 기능이 동작하지 않습니다.`);
  }
  bootstrapLiveAuctions();
});
