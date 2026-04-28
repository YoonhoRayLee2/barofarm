// 경매 라우트는 /api/lives 하위로 이동되었습니다.
// 이 파일은 하위 호환성을 위해 빈 라우터로 유지됩니다.
import { Router } from 'express';
import { Server } from 'socket.io';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function createAuctionRouter(_io: Server) {
  return Router();
}
