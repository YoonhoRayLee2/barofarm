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
const auction_1 = __importDefault(require("./socket/auction"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, { cors: { origin: '*' } });
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// LiveKit WebView HTML (live-seller.html / live-buyer.html) 정적 서빙
app.use('/live', express_1.default.static(path_1.default.join(__dirname, '..', 'public')));
app.use('/api/auctions', (0, auctions_1.default)(io));
app.use('/api/live', live_1.default);
(0, auction_1.default)(io);
const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => console.log(`Barofarm server running on port ${PORT}`));
