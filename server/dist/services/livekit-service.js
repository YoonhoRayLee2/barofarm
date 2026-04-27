"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteRoom = deleteRoom;
exports.endAuction = endAuction;
const livekit_server_sdk_1 = require("livekit-server-sdk");
const mysql_1 = __importDefault(require("../db/mysql"));
let _client = null;
function getClient() {
    if (_client)
        return _client;
    const { LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET } = process.env;
    if (!LIVEKIT_URL || !LIVEKIT_KEY || !LIVEKIT_SECRET) {
        throw new Error('LiveKit 환경 변수 미설정');
    }
    _client = new livekit_server_sdk_1.RoomServiceClient(LIVEKIT_URL, LIVEKIT_KEY, LIVEKIT_SECRET);
    return _client;
}
async function deleteRoom(roomName) {
    try {
        await getClient().deleteRoom(roomName);
    }
    catch (err) {
        // 룸이 이미 없거나 LiveKit 연결 실패 시 경고만 — 경매 종료 흐름은 차단하지 않음
        console.warn(`[livekit] deleteRoom(${roomName}) failed:`, err.message);
    }
}
async function endAuction(state) {
    try {
        await mysql_1.default.query('UPDATE auctions SET current_price = ?, top_bidder_id = ?, status = "ended", ends_at = NOW() WHERE id = ?', [state.currentPrice, state.topBidder ?? null, state.id]);
    }
    catch (e) {
        console.error('[auction] end DB save failed:', e.message);
    }
    await deleteRoom(state.id);
}
