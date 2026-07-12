// admin-wallet-production-disabled.test.ts 전용 — TEST_POINT는 켜져 있지만 운영 하드 차단은 켠 상태.
// import 선언으로 사용할 것(이유는 enable-test-points.ts 주석 참고).
process.env.PAY_FF_TEST_POINT_ENABLED = 'true';
process.env.PAY_TEST_POINT_PRODUCTION_DISABLED = 'true';
