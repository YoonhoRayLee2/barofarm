import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * 평문 비밀번호를 bcrypt 해시로 변환한다.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * 평문 비밀번호와 저장된 해시를 비교한다.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
