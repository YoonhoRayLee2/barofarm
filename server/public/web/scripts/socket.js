/**
 * Socket.io Client Wrapper — Barofarm
 * Uses the global `window.io` provided by the CDN script in index.html.
 *
 * @module socket
 */

/**
 * Connect to the Socket.io server.
 * @param {string} [baseUrl] Defaults to same-origin.
 * @returns {Socket}
 */
export function connect(baseUrl = '') {
  if (typeof window.io !== 'function') {
    throw new Error('[socket] window.io not found — socket.io CDN missing');
  }
  const target = baseUrl || window.location.origin;
  const socket = window.io(target, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });
  return socket;
}

/* ---------------- Emitters ---------------- */

/**
 * Join a live room.
 * @param {Socket} socket
 * @param {string} liveId
 * @param {string} userId
 */
export function joinRoom(socket, liveId, userId, userName, role, avatarUrl) {
  socket.emit('join', { liveId, userId, userName, role, avatarUrl });
}

/**
 * Send a bid.
 * @param {Socket} socket
 * @param {string} liveId
 * @param {string} auctionId
 * @param {number} price
 * @param {string} userId
 * @param {string} [userName]
 */
export function sendBid(socket, liveId, auctionId, price, userId, userName) {
  socket.emit('bid', { liveId, auctionId, price, userId, userName });
}

/**
 * Send a chat message.
 * @param {Socket} socket
 * @param {string} liveId
 * @param {string} userId
 * @param {string} message
 * @param {string} userName
 */
export function sendChat(socket, liveId, userId, message, userName) {
  socket.emit('chat', { liveId, userId, message, userName });
}

/**
 * Send a fcfs purchase.
 * @param {Socket} socket
 * @param {{ liveId: string, auctionId: string, userId: string, userName: string }} opts
 */
export function purchase(socket, { liveId, auctionId, userId, userName }) {
  socket.emit('purchase', { liveId, auctionId, userId, userName });
}

/**
 * Send a blind bid.
 * @param {Socket} socket
 * @param {{ liveId: string, auctionId: string, userId: string, userName: string, price: number }} opts
 */
export function bidBlind(socket, { liveId, auctionId, userId, userName, price }) {
  socket.emit('bid:blind', { liveId, auctionId, userId, userName, price });
}

/**
 * Join a giveaway (free draw).
 * @param {Socket} socket
 * @param {{ liveId: string, auctionId: string, userId: string, userName: string }} opts
 */
export function joinGiveaway(socket, { liveId, auctionId, userId, userName }) {
  socket.emit('giveaway:join', { liveId, auctionId, userId, userName });
}

/* ---------------- Listeners ---------------- */

/**
 * Subscribe to auction state updates inside a live room.
 * @param {Socket} socket
 * @param {(data: import('./models.js').Auction) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onAuctionUpdate(socket, cb) {
  socket.on('auction:update', cb);
  return () => socket.off('auction:update', cb);
}

/**
 * Subscribe to auction-ended events.
 * @param {Socket} socket
 * @param {(data: import('./models.js').Auction) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onAuctionEnded(socket, cb) {
  socket.on('auction:ended', cb);
  return () => socket.off('auction:ended', cb);
}

/**
 * Subscribe to chat messages.
 * @param {Socket} socket
 * @param {(msg: import('./models.js').ChatMessage) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onChatMessage(socket, cb) {
  socket.on('chat:message', cb);
  return () => socket.off('chat:message', cb);
}

/**
 * Subscribe to viewer count updates.
 * @param {Socket} socket
 * @param {(data: { liveId: string, count: number }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onViewerCount(socket, cb) {
  socket.on('viewer:count', cb);
  return () => socket.off('viewer:count', cb);
}

/**
 * Subscribe to lobby — new live created.
 * @param {Socket} socket
 * @param {(live: import('./models.js').Live) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onLobbyLiveNew(socket, cb) {
  socket.on('lobby:live:new', cb);
  return () => socket.off('lobby:live:new', cb);
}

/**
 * Subscribe to lobby — live ended.
 * @param {Socket} socket
 * @param {(data: { liveId: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onLobbyLiveEnded(socket, cb) {
  socket.on('lobby:live:ended', cb);
  return () => socket.off('lobby:live:ended', cb);
}

/**
 * Subscribe to live:ended — seller ended the broadcast (in-room).
 * @param {Socket} socket
 * @param {(data: { liveId: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onLiveEnded(socket, cb) {
  socket.on('live:ended', cb);
  return () => socket.off('live:ended', cb);
}

/**
 * Subscribe to purchase:made events (fcfs).
 * @param {Socket} socket
 * @param {(data: { userId: string, userName: string, soldIndex: number, ts: number }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onPurchaseMade(socket, cb) {
  socket.on('purchase:made', cb);
  return () => socket.off('purchase:made', cb);
}

/**
 * Subscribe to bid:blind:ack events (own blind bid acknowledged).
 * @param {Socket} socket
 * @param {(data: { auctionId: string, price: number }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onBidBlindAck(socket, cb) {
  socket.on('bid:blind:ack', cb);
  return () => socket.off('bid:blind:ack', cb);
}

/**
 * Subscribe to blind:bid:count — room-wide participant count update.
 * @param {Socket} socket
 * @param {(data: { auctionId: string, count: number }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onBlindBidCount(socket, cb) {
  socket.on('blind:bid:count', cb);
  return () => socket.off('blind:bid:count', cb);
}

/**
 * Subscribe to bid:rejected events (own bid was rejected by the server).
 * @param {Socket} socket
 * @param {(data: { reason: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onBidRejected(socket, cb) {
  socket.on('bid:rejected', cb);
  return () => socket.off('bid:rejected', cb);
}

/**
 * Subscribe to giveaway:count — participant count broadcast.
 * @param {Socket} socket
 * @param {(data: { auctionId: string, count: number, participants: Array<{userId:string,userName:string}> }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onGiveawayCount(socket, cb) {
  socket.on('giveaway:count', cb);
  return () => socket.off('giveaway:count', cb);
}

/**
 * Subscribe to giveaway:join:ack — own join acknowledged.
 * @param {Socket} socket
 * @param {(data: { ok: boolean, alreadyJoined?: boolean, count?: number, error?: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onGiveawayJoinAck(socket, cb) {
  socket.on('giveaway:join:ack', cb);
  return () => socket.off('giveaway:join:ack', cb);
}

/**
 * Subscribe to viewer:list events.
 * @param {Socket} socket
 * @param {(data: { viewers: Array<{ userName: string, avatarUrl: string|null }> }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onViewerList(socket, cb) {
  socket.on('viewer:list', cb);
  return () => socket.off('viewer:list', cb);
}

export function onViewerJoin(socket, cb) {
  socket.on('viewer:join', cb);
  return () => socket.off('viewer:join', cb);
}

/**
 * Request the current viewer list for a live room (server responds with viewer:list).
 * @param {Socket} socket
 * @param {string} liveId
 */
export function requestViewerList(socket, liveId) {
  socket.emit('viewer:list:get', { liveId });
}

/**
 * Send an emoji reaction.
 * @param {Socket} socket
 * @param {{ liveId: string, emoji: string, userId: string, userName: string }} opts
 */
export function sendEmojiReact(socket, { liveId, emoji, userId, userName }) {
  socket.emit('emoji:react', { liveId, emoji, userId, userName });
}

/**
 * Subscribe to emoji reaction broadcasts.
 * @param {Socket} socket
 * @param {(data: { emoji: string, userId?: string, userName?: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onEmojiReaction(socket, cb) {
  socket.on('emoji:reaction', cb);
  return () => socket.off('emoji:reaction', cb);
}

/* ---------------- Follow / personal notifications ---------------- */

/**
 * Identify the current user to the server so they join their personal room.
 * @param {Socket} socket
 * @param {string|number} userId
 */
export function identifyUser(socket, userId) {
  socket.emit('user:identify', { userId: String(userId) });
}

/**
 * Subscribe to follow:live:started — fired when a followed seller goes live.
 * @param {Socket} socket
 * @param {(data: { liveId: string, sellerId: string, sellerName: string, title: string, thumbnailUrl?: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onFollowLiveStarted(socket, cb) {
  socket.on('follow:live:started', cb);
  return () => socket.off('follow:live:started', cb);
}

/**
 * Subscribe to auction:new — a new auction started inside a live room.
 * @param {Socket} socket
 * @param {(data: { auctionId: string, liveId: string, productName: string, startPrice: number, mode: string }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onAuctionNew(socket, cb) {
  socket.on('auction:new', cb);
  return () => socket.off('auction:new', cb);
}
