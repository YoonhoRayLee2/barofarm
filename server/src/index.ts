import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';

import createAuctionRouter from './routes/auctions';
import liveRoutes from './routes/live';
import userRoutes from './routes/users';
import registerAuctionSocket from './socket/auction';

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

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => console.log(`Barofarm server running on port ${PORT}`));
