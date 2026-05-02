import pool from '../db/mysql';

const ADJECTIVES = [
  '잔망스러운', '귀여운', '용감한', '재빠른', '씩씩한',
  '포근한', '당당한', '영리한', '엉뚱한', '다정한',
  '활발한', '느긋한', '예리한', '신나는', '기운찬',
  '차분한', '명랑한', '듬직한', '민첩한', '뚝심있는',
  '맹렬한', '온화한', '경쾌한', '날렵한', '따뜻한',
  '호기심많은', '든든한', '꼼꼼한', '상냥한', '대담한',
  '부지런한', '의젓한', '신중한', '노련한', '빠릿한',
  '사려깊은', '풍요로운', '넉넉한', '깔끔한', '정직한',
  '솔직한', '진지한', '유쾌한', '쾌활한', '넘치는',
  '탄탄한', '믿음직한', '활기찬', '쑥쑥크는', '반짝이는',
];

const ANIMALS = [
  '까마귀', '수달', '너구리', '토끼', '여우',
  '곰', '사슴', '고슴도치', '판다', '코알라',
  '부엉이', '펭귄', '오리', '고양이', '강아지',
  '다람쥐', '기린', '코끼리', '하마', '악어',
  '독수리', '참새', '원숭이', '늑대', '표범',
  '사자', '호랑이', '치타', '두더지', '뱀',
];

/**
 * 형용사 + 동물 + 3자리 숫자(zero-padded) 조합으로 닉네임을 생성한다.
 * 예: "잔망스러운까마귀453"
 */
export function generateNickname(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const num = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  return `${adj}${animal}${num}`;
}

/**
 * DB users 테이블에 중복 닉네임이 없을 때까지 재시도한다.
 * 10회 실패 시 throw.
 */
export async function generateUniqueNickname(maxRetry = 10): Promise<string> {
  for (let i = 0; i < maxRetry; i++) {
    const candidate = generateNickname();
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE nickname = ?',
      [candidate],
    ) as [unknown[], unknown];
    if ((rows as unknown[]).length === 0) {
      return candidate;
    }
  }
  throw new Error('[nickname] generateUniqueNickname: max retries exceeded');
}
