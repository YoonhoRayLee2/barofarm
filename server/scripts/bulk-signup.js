/**
 * 일회성 bulk 회원가입 스크립트.
 * 학번(username=password=학번), 이름(nickname=name), role=buyer.
 * phone은 UNIQUE NOT NULL 이라 학번 기반 더미(010+학번)로 생성.
 *
 * 실행: cd server && node scripts/bulk-signup.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

const PEOPLE = [
  ['19300862', '김동한'],
  ['25400088', '김수민'],
  ['25300140', '김태훈'],
  ['19301088', '양동현'],
  ['24300504', '김재현'],
  ['24300237', '이윤호'],
  ['20300491', '양종호'],
  ['20400347', '이다연'],
  ['22400210', '최수정'],
  ['22300403', '김판준'],
  ['18300048', '권지훈'],
  ['03301140', '이동우'],
  ['21400111', '홍유진'],
  ['08306433', '황인준'],
  ['98102597', '이동하'],
  ['12303492', '지성태'],
  ['14311066', '임현우'],
  ['14410306', '박애진'],
  ['19300171', '이명진'],
];

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASS, database: process.env.DB_NAME,
  });

  let inserted = 0, skipped = 0;
  for (const [studentId, name] of PEOPLE) {
    // 비밀번호는 학번(아이디와 동일). 8자리라 signup의 8자 최소길이 충족.
    const hash = await bcrypt.hash(studentId, SALT_ROUNDS);
    // phone: UNIQUE 보장 위해 학번 기반 더미. 010 + 8자리 = 11자리.
    const phone = '010' + studentId;
    try {
      await c.execute(
        `INSERT INTO users (username, password_hash, nickname, name, phone, role)
         VALUES (?, ?, ?, ?, ?, 'buyer')`,
        [studentId, hash, name, name, phone],
      );
      inserted++;
      console.log(`OK  ${studentId} ${name}`);
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        skipped++;
        console.log(`SKIP ${studentId} ${name} (이미 존재)`);
      } else {
        console.error(`FAIL ${studentId} ${name}: ${e.message}`);
      }
    }
  }
  console.log(`\n완료: ${inserted}건 삽입, ${skipped}건 스킵`);
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });
