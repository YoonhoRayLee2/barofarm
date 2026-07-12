/**
 * 결제 인증세션 토큰 쿠키 파싱 유틸.
 * cookie-parser 미들웨어를 새로 추가하지 않기 위해, 필요한 최소 기능(단일 쿠키 값 파싱)만 자체 구현한다.
 */

/** Request 헤더의 raw Cookie 문자열에서 특정 이름의 쿠키 값을 추출한다. */
export function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }
  return null;
}
