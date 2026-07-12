// admin-wallet.test.ts 전용 — TEST_POINT 기능을 켜고 운영 하드 차단은 끈다.
// 반드시 import 선언으로 사용할 것(테스트 파일 본문에 인라인 대입하면 TypeScript가 CommonJS로
// 컴파일할 때 import 구문들을 먼저 끌어올려(hoist) 실제 실행 순서가 뒤바뀔 수 있다).
process.env.PAY_FF_TEST_POINT_ENABLED = 'true';
process.env.PAY_TEST_POINT_PRODUCTION_DISABLED = 'false';
