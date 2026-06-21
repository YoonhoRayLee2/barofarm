"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const live_1 = __importStar(require("./routes/live"));
const users_1 = __importDefault(require("./routes/users"));
const auth_1 = __importDefault(require("./routes/auth"));
const favorites_1 = require("./routes/favorites");
const products_1 = __importDefault(require("./routes/products"));
const auctions_1 = __importDefault(require("./routes/auctions"));
const tracking_1 = __importDefault(require("./routes/tracking"));
const chat_rooms_1 = __importDefault(require("./routes/chat-rooms"));
const consignments_1 = __importDefault(require("./routes/consignments"));
const delivery_addresses_1 = __importDefault(require("./routes/delivery-addresses"));
const market_prices_1 = __importDefault(require("./routes/market-prices"));
const hanaro_stores_1 = __importDefault(require("./routes/hanaro-stores"));
const admin_1 = __importDefault(require("./routes/admin"));
const group_deals_1 = require("./routes/group-deals");
const recommendations_1 = __importDefault(require("./routes/recommendations"));
const timelines_1 = __importDefault(require("./routes/timelines"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const auction_1 = __importDefault(require("./socket/auction"));
const chat_1 = __importDefault(require("./socket/chat"));
const mysql_1 = __importDefault(require("./db/mysql"));
if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
}
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : null; // null = 모든 origin 허용 (미설정 시 개방)
const corsOrigin = allowedOrigins
    ? (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin))
            callback(null, true);
        else
            callback(null, false);
    }
    : true;
const io = new socket_io_1.Server(server, {
    cors: { origin: corsOrigin, credentials: true },
});
app.use((0, cors_1.default)({ origin: corsOrigin, credentials: true }));
app.use(express_1.default.json());
// LiveKit WebView HTML (live-seller.html / live-buyer.html) 정적 서빙
app.use('/live', express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
// SPA 웹앱 정적 서빙 (개발: WebView 캐시 무효화)
app.use('/app', express_1.default.static(path_1.default.join(__dirname, '..', 'public', 'web'), {
    etag: false,
    lastModified: false,
    cacheControl: false,
    setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    },
}));
app.get('/', (req, res) => {
    res.redirect('/app/home');
});
// SPA history fallback — 파일 확장자가 없는 /app/* 경로는 index.html 반환
app.get('/app/*', (req, res, next) => {
    if (req.path.includes('.'))
        return next();
    res.sendFile(path_1.default.join(__dirname, '..', 'public', 'web', 'index.html'));
});
// 업로드 파일 정적 서빙 (/uploads/auctions/{id}.jpg)
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '..', 'public', 'uploads')));
// /api/live/token — 기존 호환 유지
app.use('/api/live', live_1.default);
// /api/lives — Live/Auction 통합 라우터
app.use('/api/lives', (0, live_1.createLiveRouter)(io));
// [deprecated] 기존 단순 upsert 라우트 — 하위 호환 유지
app.use('/api/users', users_1.default);
// JWT 기반 인증 라우트
app.use('/api/auth', auth_1.default);
app.use('/api/favorites', (0, favorites_1.createFavoritesRouter)(io, mysql_1.default));
app.use('/api/products', products_1.default);
app.use('/api/auctions', auctions_1.default);
app.use('/api/tracking', tracking_1.default);
app.use('/api/chat-rooms', chat_rooms_1.default);
app.use('/api/consignments', consignments_1.default);
app.use('/api/delivery-addresses', delivery_addresses_1.default);
app.use('/api/market-prices', market_prices_1.default);
app.use('/api/hanaro-stores', hanaro_stores_1.default);
app.use('/admin', admin_1.default);
app.use('/api/group-deals', (0, group_deals_1.createGroupDealsRouter)(io));
app.use('/api/recommendations', recommendations_1.default);
app.use('/api/timelines', timelines_1.default);
app.use('/api/notifications', notifications_1.default);
(0, auction_1.default)(io);
(0, chat_1.default)(io);
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
