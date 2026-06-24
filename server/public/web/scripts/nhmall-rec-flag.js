/**
 * 농협몰 추천 컴포넌트 한시적 노출 제어 플래그.
 *
 * 2026-06-25 (Asia/Seoul) 하루 동안만 농협몰 추천을 숨긴다.
 * 그 외 날짜에는 정상 노출되며, 자정이 지나면 자동 복구된다.
 *
 * @module scripts/nhmall-rec-flag
 */

/** 추천을 숨길 날짜 목록 (YYYY-MM-DD, Asia/Seoul 기준). */
const HIDDEN_DATES = ['2026-06-25'];

/**
 * 현재(한국시간) 농협몰 추천을 숨겨야 하는지 여부.
 * @returns {boolean}
 */
export function isNhmallRecHidden() {
  // 'en-CA' 로케일은 YYYY-MM-DD 형식을 반환한다.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  return HIDDEN_DATES.includes(today);
}
