// 테스트용 최소 Express 앱 빌더 — index.ts 전체(서버 listen, 소켓, 스케줄러 등)를 띄우지 않고
// 필요한 라우터만 마운트한다. supertest가 요청마다 임시 포트로 listen/close를 알아서 처리하므로
// 별도의 server.listen()/close()가 필요 없다(좀비 프로세스 방지).

import './env';
import express, { Router } from 'express';

// payment-auth-session의 쿠키 파싱(getCookieValue)은 req.headers.cookie 문자열을 직접 파싱하므로
// cookie-parser 미들웨어 없이도 동작한다.
export function buildApp(mounts: Record<string, Router>): express.Express {
  const app = express();
  app.use(express.json());
  for (const [path, router] of Object.entries(mounts)) {
    app.use(path, router);
  }
  return app;
}
