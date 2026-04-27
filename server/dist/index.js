"use strict";
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
const auctions_1 = __importDefault(require("./routes/auctions"));
const live_1 = __importDefault(require("./routes/live"));
const users_1 = __importDefault(require("./routes/users"));
const auction_1 = __importDefault(require("./socket/auction"));
const mysql_1 = __importDefault(require("./db/mysql"));
const memory_1 = require("./store/memory");
const livekit_service_1 = require("./services/livekit-service");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, { cors: { origin: '*' } });
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// LiveKit WebView HTML (live-seller.html / live-buyer.html) 정적 서빙
app.use('/live', express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.use('/api/auctions', (0, auctions_1.default)(io));
app.use('/api/live', live_1.default);
app.use('/api/users', users_1.default);
(0, auction_1.default)(io);
// 서버 시작 시 DB의 status='live' 경매를 메모리 + 타이머로 자동 복원
async function bootstrapLiveAuctions() {
    try {
        const [rows] = await mysql_1.default.query('SELECT id, seller_id, product_name, start_price, current_price, status FROM auctions WHERE status = "live"');
        let loaded = 0;
        for (const row of rows) {
            const id = String(row.id);
            if (memory_1.auctions.has(id))
                continue;
            (0, memory_1.createAuction)(id, {
                productName: row.product_name,
                startPrice: row.start_price,
                sellerId: String(row.seller_id),
            });
            (0, memory_1.startTimer)(id, io, async (state) => {
                await (0, livekit_service_1.endAuction)(state);
            });
            loaded += 1;
        }
        console.log(`[bootstrap] Loaded ${loaded} live auction(s) into memory`);
    }
    catch (e) {
        console.error('[bootstrap] Failed to load live auctions:', e.message);
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
