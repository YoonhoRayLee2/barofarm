# LiveKit Stage 1 - 라이브 커머스 WebRTC 연동

## 생성/수정된 파일

### 신규 생성
- `server/public/live-seller.html`
  - 셀러용 WebView (방송 송출)
  - `webview_flutter` 안에서 로드되며 `?serverUrl=...&token=...` 쿼리 파라미터로 LiveKit 접속 정보 수신
  - 후면 카메라(`facingMode: 'environment'`) 자동 publish
  - 마이크 / 카메라 / 방송 종료 컨트롤
  - LIVE 뱃지(#FF3B3B) + 연결 품질 표시
  - 방송 종료 시 `window.FlutterChannel?.postMessage('onLiveEnd')` 호출
- `server/public/live-buyer.html`
  - 바이어용 WebView (방송 시청)
  - `?serverUrl=...&token=...` 쿼리 파라미터로 LiveKit 접속 정보 수신
  - 셀러 영상 fullscreen (`object-fit: cover`)
  - 오디오 자동 재생 (자동재생 차단 시 탭 1회로 해제)
  - 셀러 disconnect 또는 자체 disconnect 시 종료 카드 노출 + Flutter 브릿지 호출
  - Flutter 측 댓글/입찰 오버레이용 빈 공간 보장 (HTML 내 별도 UI 없음)
- `_workspace/livekit_stage1.md` (본 문서)

### 수정
- `server/src/routes/live.ts`
  - `POST /api/live/token` — `{ roomName, userId, role }` 검증
  - 셀러 → `canPublish: true`, 바이어 → `canPublish: false`
  - `LIVEKIT_KEY` / `LIVEKIT_SECRET` 미설정 시 500 + 한국어 안내 메시지
  - `ttl: '2h'` 적용
  - 응답에 `serverUrl`(env 의 `LIVEKIT_URL`) 동봉 → Flutter 단에서 별도 환경 변수 필요 없음
- `server/src/index.ts`
  - `app.use('/live', express.static(path.join(__dirname, '..', 'public')))`
  - WebView 가 `<host>:3000/live/live-seller.html` / `<host>:3000/live/live-buyer.html` 로 접근 가능

## API 사용법

```http
POST /api/live/token
Content-Type: application/json

{
  "roomName": "auction_42",
  "userId": "user_17",
  "role": "seller"
}
```

응답 예:
```json
{
  "token": "eyJhbGciOi...",
  "serverUrl": "wss://barofarm-xxxxx.livekit.cloud",
  "role": "seller",
  "roomName": "auction_42"
}
```

## Flutter WebView 연결 예 (참고)

셀러:
```
http://<server-host>:3000/live/live-seller.html?serverUrl=<encoded wss>&token=<jwt>
```

바이어:
```
http://<server-host>:3000/live/live-buyer.html?serverUrl=<encoded wss>&token=<jwt>
```

Flutter 쪽에서는 JavaScript 채널을 `FlutterChannel` 이름으로 등록:
- `onLiveEnd` — 셀러가 방송 종료 / 바이어 측 disconnect 감지
- `onLiveStart` — 바이어가 첫 비디오 트랙 수신
- `onLiveError` — 연결 실패

## LiveKit Cloud 설정 방법

1. https://cloud.livekit.io 가입 및 로그인
2. **Create Project** 클릭 → 프로젝트 이름(예: `barofarm`) 입력
3. 좌측 메뉴 **Settings → Keys** 에서 **Add API Key** 클릭
   - API Key (`APIxxxxxxxxxxxxx`)
   - Secret Key (`secret...`) 두 값을 즉시 메모 (Secret 은 재확인 불가)
4. 프로젝트 대시보드 상단의 **Project URL** 확인 (`wss://<project>.livekit.cloud`)
5. `server/.env` 에 다음 값 등록:

   ```env
   LIVEKIT_KEY=APIxxxxxxxxxxxxx
   LIVEKIT_SECRET=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   LIVEKIT_URL=wss://<project>.livekit.cloud
   ```

6. 서버 재시작 (`npm run dev`)
7. (선택) **Settings → Rooms** 에서 자동 종료 정책 / 최대 참가자 수 등 정책 설정

### 무료 플랜 한도 (참고, 변동 가능)
- 동시 참가자: 100명
- 월 전송량: 5GB

라이브 커머스 트래픽이 더 필요하면 **Build / Ship** 유료 플랜으로 업그레이드.

## 다음 단계 (Stage 2 예상)
- Flutter 쪽 `LiveSellerScreen` / `LiveBuyerScreen` (webview_flutter + JavaScriptChannel)
- 토큰 캐싱 / 재발급 정책
- 서버에서 RoomService 로 방 종료 시 강제 disconnect
- 녹화(Egress) 또는 장면 전환 시 시나리오
