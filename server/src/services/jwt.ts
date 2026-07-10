import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  username: string;
}

const ACCESS_EXPIRES = '14d';
const REFRESH_EXPIRES = '30d';

function getSecret(): string {
  return process.env.JWT_SECRET!;
}

/**
 * access token 발급 (HS256, 14일 만료)
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    expiresIn: ACCESS_EXPIRES,
  });
}

/**
 * refresh token 발급 (HS256, 30일 만료)
 */
export function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: 'refresh' }, getSecret(), {
    algorithm: 'HS256',
    expiresIn: REFRESH_EXPIRES,
  });
}

/**
 * 토큰 검증. 유효하면 payload 반환, 무효면 null.
 */
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as jwt.JwtPayload & JwtPayload;
    if (typeof decoded.userId !== 'number' || typeof decoded.username !== 'string') {
      return null;
    }
    return { userId: decoded.userId, username: decoded.username };
  } catch {
    return null;
  }
}
