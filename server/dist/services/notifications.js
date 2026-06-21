"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = createNotification;
exports.createNotificationsBulk = createNotificationsBulk;
const mysql_1 = __importDefault(require("../db/mysql"));
async function createNotification(userId, payload) {
    await mysql_1.default.execute('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)', [userId, payload.type, payload.title, payload.body ?? null, payload.link ?? null]);
}
async function createNotificationsBulk(userIds, payload) {
    if (userIds.length === 0)
        return;
    const placeholders = userIds.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = [];
    for (const uid of userIds) {
        params.push(uid, payload.type, payload.title, payload.body ?? null, payload.link ?? null);
    }
    await mysql_1.default.execute(`INSERT INTO notifications (user_id, type, title, body, link) VALUES ${placeholders}`, params);
}
