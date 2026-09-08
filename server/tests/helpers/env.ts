// 테스트 전용 환경 설정 — 반드시 다른 src/* import보다 먼저 import할 것(db/mysql.ts가 모듈
// 로드 시점에 process.env를 읽어 커넥션 풀을 생성하므로, 이 파일을 통해 DB_NAME을 barofarm_test로
// 덮어쓴 뒤에 pool/서비스 모듈을 import해야 실제 개발 DB(barofarm)를 건드리지 않는다.
//
// 개별 테스트 파일이 PAY_* 정책 값을 다르게 검증하고 싶으면(예: TEST_POINT_ENABLED=true),
// 이 파일을 import한 직후 / 다른 src 모듈을 import하기 전에 process.env.PAY_xxx = '...'를 설정하면 된다.
// (node --test는 테스트 파일마다 별도 프로세스를 띄우므로 파일 간 환경변수 오염이 없다.)

import path from 'path';
import dotenv from 'dotenv';

// 로컬 개발 환경(Node 프로세스)과 DB 컨테이너의 시스템 타임존이 다르면(예: 프로세스는 Asia/Seoul,
// DB 컨테이너는 UTC) mysql2가 naive DATETIME(서버 NOW()/DATE_ADD 결과)을 프로세스 로컬 타임존
// 기준으로 잘못 해석해 시각 비교가 틀어질 수 있다(services/payment-credential.ts의 잠금 만료 비교 등).
// 테스트를 환경에 무관하게 결정적으로 만들기 위해 UTC로 고정한다.
process.env.TZ = 'UTC';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// 절대 개발 DB(barofarm)를 직접 건드리지 않도록 테스트 전용 DB로 고정한다.
process.env.DB_NAME = 'barofarm_test';
