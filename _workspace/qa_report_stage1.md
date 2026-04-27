# QA Report — Stage 1 (Backend + LiveKit 레이어 정합성 검증)

- 검증 일자: 2026-04-27
- 검증자: barofarm QA agent
- 검증 대상: `/Users/uknow/Desktop/barofarm/server/src/`, `/Users/uknow/Desktop/barofarm/server/public/`, `/Users/uknow/Desktop/barofarm/server/tsconfig.json`
- 타입체크 결과: `npx tsc --noEmit` — 오류 0건 통과

---

## Critical (반드시 수정 필요)

### C1. `auction.timeLeft` 카운트다운 루프 부재 — 경매가 시간으로 끝나지 않음
- 위치: `server/src/socket/auction.ts`, `server/src/store/memory.ts`
- 현황: `createAuction()`이 `timeLeft: 30` 으로 초기화하지만, 어디에서도 `setInterval`/`setTimeout` 로 감소시키지 않는다. 따라서:
  - `auction.timeLeft <= 10` 자동 연장 조건은 **결코 발화되지 않음** (입찰이 시작되어도 timeLeft는 30에서 멈춰 있음).
  - 클라이언트 측 카운트다운이 별도로 존재하더라도 서버 권위(authoritative) 종료 트리거가 없어 `PATCH /:id/end` 가 호출될 시점이 정의되지 않음.
- 결과: Stage 1 사양상 핵심 로직인 "와이스 방식 +10초 자동 연장" 이 사실상 데드코드 상태.
- 권장 수정:
  ```ts
  // socket/auction.ts 진입부에 1초 틱 루프 추가
  setInterval(() => {
    for (const [roomId, a] of auctions) {
      if (a.status !== 'live') continue;
      if (a.timeLeft > 0) a.timeLeft -= 1;
      if (a.timeLeft <= 0) {
        a.status = 'ended';
        io.to(roomId).emit('auction:end', a);
      } else {
        io.to(roomId).emit('auction:tick', { timeLeft: a.timeLeft });
      }
    }
  }, 1000);
  ```

---

## Warning (개선 권장)

### W1. `PATCH /:id/start` 중복 호출 방어 없음
- 위치: `server/src/routes/auctions.ts:44-55`
- 현황: 같은 id 로 `start` 가 여러 번 호출되면 `createAuction()` 이 메모리 상태를 덮어써 진행 중인 입찰가/탑비더가 초기화될 수 있음.
- 권장: `if (auctions.has(String(id))) return res.status(409).json(...)` 또는 DB `status` 가 이미 `live` 인지 검사.

### W2. 시작 시 초기 상태가 룸에 emit 되지 않음
- 위치: `server/src/routes/auctions.ts:44-55`
- 현황: `createAuction()` 후 `io.to(roomId).emit('auction:update', ...)` 가 없음. `socket.on('join')` 에 의존해 클라이언트가 join 후 emit 받지만, 시작 직전에 join 한 클라이언트는 갱신을 못 받을 수 있음.
- 권장: 라우터에서 io 인스턴스를 받아 시작 시점에 즉시 broadcast.

### W3. 셀러 본인 입찰 차단 부재
- 위치: `server/src/socket/auction.ts:12-24`
- 현황: `bid` 핸들러가 `userId === auction.sellerId` 인지 확인하지 않음. 셀러가 자기 경매에 입찰해 가격을 끌어올릴 수 있음.
- 권장: `if (userId === auction.sellerId) return;` 추가.

### W4. `LIVEKIT_URL` 미설정 시 응답 `serverUrl: null` 로 통과
- 위치: `server/src/routes/live.ts:59`
- 현황: `serverUrl: process.env.LIVEKIT_URL ?? null` — env 누락 시 토큰만 발급되고 `serverUrl` 이 null 로 응답. WebView 페이지(`live-seller.html`, `live-buyer.html`)에서 `!serverUrl || !token` 로 늦게 거르지만, 서버에서 미리 차단하는 것이 명확함.
- 권장: `LIVEKIT_KEY`/`LIVEKIT_SECRET` 검사와 동일하게 `LIVEKIT_URL` 도 검사 후 500 반환.

### W5. 메모리 상태 영구 손실 위험 — 서버 재시작 시 진행 중 경매 소실
- 위치: `server/src/store/memory.ts`
- 현황: 메모리 Map 만 사용, DB 백업이나 Redis 등 외부 저장소 없음. 서버 크래시/재시작 시 진행 중인 모든 경매 상태(현재가, 탑비더, 남은 시간) 유실.
- 권장: Stage 2 이상에서 Redis 도입을 명시. 현재는 README/CLAUDE.md 에 알려진 한계로 명문화 권장.

---

## Info (참고 / 의도적 차이)

### I1. `PATCH /:id/end` 의 DB UPDATE / `auctions.delete()` 순서
- 위치: `server/src/routes/auctions.ts:58-67`
- 사양 요청서 표현: "auctions.delete() + DB UPDATE 순서"
- 현재 구현: **DB UPDATE → `auctions.delete()`** (역순)
- 평가: 현재 구현이 더 안전함. UPDATE 가 실패할 경우 메모리 상태가 보존되어 재시도 가능. 사양 표현은 단순 나열로 보이며 실제 트랜잭션 의도와 어긋나지 않음. 의도적으로 수정 불필요.

### I2. `tsconfig.json` 검증 — 모든 항목 OK
- `rootDir: "./src"`, `outDir: "./dist"`, `strict: true`, `esModuleInterop: true`, `target: ES2022`, `module: CommonJS`, `skipLibCheck: true`, `forceConsistentCasingInFileNames: true`, `resolveJsonModule: true`. Stage 1 요구사항 모두 충족.

### I3. `index.ts` static 경로 검증 — OK
- `path.join(__dirname, '..', 'public')` 컴파일 후 `dist/index.js` 기준 `dist/../public` = `server/public/`. 정확히 의도된 경로.
- `routes/auctions`, `routes/live`, `socket/auction` 세 모듈 모두 import 및 mount 됨.

### I4. `routes/live.ts` 검증 — 모두 OK
- `LIVEKIT_KEY` / `LIVEKIT_SECRET` 누락 시 500 + 한국어 안내 ✓
- `role` 셀러/바이어 분기로 `canPublish` 결정 ✓
- `await token.toJwt()` 비동기 처리 ✓ (livekit-server-sdk v2 에서 `toJwt()` 가 Promise 반환)
- 응답에 `serverUrl`, `token`, `role`, `roomName` 포함 ✓
- TTL `'2h'` 문자열 형식 ✓ (v2 SDK 허용)

### I5. `store/memory.ts` `AuctionState` 인터페이스 — 적절
- `status: 'live' | 'ended'` 만 존재(메모리에는 `pending` 없음). DB 스키마(`'pending' | 'live' | 'ended'`)와 의도적 차이. `pending` 상태 경매는 메모리에 진입하지 않음.
- `createAuction()` 반환 타입 `void` — 호출부에서 결과를 사용하지 않으므로 OK.
- `timeLeft: 30` 하드코딩 — Stage 2 에서 DB 컬럼/요청 파라미터로 외부화 권장.

### I6. `live-seller.html` 검증 — 모두 OK
- `URLSearchParams(location.search)` 로 `serverUrl`, `token` 파싱 ✓
- `LK.createLocalVideoTrack({ facingMode: 'environment', ... })` ✓
- `window.FlutterChannel?.postMessage(...)` 브릿지 — `onLiveEnd`, `onLiveError` 두 종류 발신.
- 부가 기능: connection quality pill, mic/cam mute, beforeunload 시 disconnect.
- 참고: `onLiveStart` 이벤트는 셀러 측에서 송출하지 않음(바이어만). 의도된 분리.

### I7. `live-buyer.html` 검증 — 모두 OK
- `LK.RoomEvent.TrackSubscribed` 에서 `track.kind` 분기 후 video → `remoteVideoEl.attach()`, audio → `remoteAudioEl.attach()` ✓
- Fullscreen: `position: absolute; inset: 0; width:100%; height:100%; object-fit: cover` ✓
- `FlutterChannel.postMessage('onLiveEnd')` — Disconnected 또는 셀러 publication 소실 시 호출 ✓
- 자동재생 차단 우회: `unmuteBanner` + document click 핸들러 — 추가 점수.
- 사용 API(`room.remoteParticipants`, `videoTrackPublications`) 모두 livekit-client v2 정합.

---

## 종합 결론

- 정적 분석/타입 체크는 통과(`tsc --noEmit` clean).
- LiveKit 토큰 발급 및 WebView 양면 구현은 **사양 100% 충족**.
- 백엔드 핵심 로직 중 **타이머 틱 루프 부재(C1)** 가 단일 Critical 이슈로, 이것이 해결되지 않으면 Stage 1 데모는 "입찰은 되지만 끝나지 않는 경매" 상태가 됨. 와이스 방식 자동 연장 로직(`timeLeft <= 10` 분기)도 함께 사문화.
- Warning 4건은 데모를 막진 않지만 사용자 경험/데이터 무결성 측면에서 Stage 2 이전 정리 권장.
