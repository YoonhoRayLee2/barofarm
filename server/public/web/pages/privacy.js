/**
 * Privacy Policy Page — 4-1b-F
 * 바로팜 개인정보처리방침
 *
 * @module pages/privacy
 */

// Inject CSS once (reuse terms.css)
const _cssId = 'page-css-terms';
if (!document.getElementById(_cssId)) {
  const link = document.createElement('link');
  link.id = _cssId;
  link.rel = 'stylesheet';
  link.href = '/app/pages/terms.css';
  document.head.appendChild(link);
}

/**
 * @returns {Promise<HTMLElement>}
 */
export default async function load() {
  const page = document.createElement('div');
  page.className = 'terms-page';
  page.dataset.theme = 'light';

  const header = document.createElement('header');
  header.className = 'terms-header';
  header.innerHTML = `
    <button class="terms-header__back" aria-label="뒤로 가기">‹</button>
    <h1 class="terms-header__title">개인정보처리방침</h1>
  `;
  header.querySelector('.terms-header__back').addEventListener('click', () => window.history.back());
  page.appendChild(header);

  const body = document.createElement('div');
  body.className = 'terms-body';
  body.innerHTML = `
    <p class="terms-meta">시행일: 2025년 1월 1일 &nbsp;|&nbsp; 바로팜 운영팀</p>
    <p>바로팜(이하 "서비스")은 개인정보보호법 등 관련 법령에 따라 이용자의 개인정보를 보호하고, 이와 관련한 고충을 신속하고 원활하게 처리하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.</p>

    <h2 class="terms-section-title">1. 수집하는 개인정보 항목</h2>
    <p>서비스는 다음의 개인정보를 수집합니다.</p>
    <table class="terms-table">
      <thead>
        <tr><th>항목</th><th>수집 시점</th><th>수집 방법</th></tr>
      </thead>
      <tbody>
        <tr><td>이름</td><td>회원가입</td><td>앱 내 직접 입력</td></tr>
        <tr><td>휴대폰 번호</td><td>회원가입</td><td>앱 내 직접 입력</td></tr>
        <tr><td>FCM 토큰</td><td>앱 설치 후 최초 실행</td><td>Firebase 자동 발급</td></tr>
        <tr><td>라이브 시청 로그</td><td>라이브 방송 시청 시</td><td>자동 수집</td></tr>
        <tr><td>입찰 기록</td><td>경매 입찰 시</td><td>자동 수집</td></tr>
      </tbody>
    </table>

    <h2 class="terms-section-title">2. 개인정보 수집 목적</h2>
    <ol class="terms-ol">
      <li><strong>이름, 휴대폰 번호</strong>: 회원 식별, 서비스 제공, 낙찰 거래 처리, 고객 문의 응대</li>
      <li><strong>FCM 토큰</strong>: 라이브 방송 시작, 낙찰 결과 등 앱 푸시 알림 발송</li>
      <li><strong>라이브 시청 로그</strong>: 서비스 통계 분석 및 품질 개선</li>
      <li><strong>입찰 기록</strong>: 낙찰 내역 확인, 분쟁 조정, 법령 준수</li>
    </ol>

    <h2 class="terms-section-title">3. 개인정보 보유 및 이용 기간</h2>
    <ol class="terms-ol">
      <li>회원 탈퇴 시 즉시 삭제합니다. 단, 관련 법령에 따라 아래 기간 동안 보관합니다:</li>
      <li>전자상거래 등에서의 소비자보호에 관한 법률: 계약·청약 철회 기록 5년, 대금 결제·공급 기록 5년, 소비자 불만·분쟁 처리 기록 3년</li>
      <li>통신비밀보호법: 서비스 이용 관련 로그 3개월</li>
    </ol>

    <h2 class="terms-section-title">4. 개인정보의 제3자 제공</h2>
    <p>서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 다음의 경우에 한해 제공합니다.</p>
    <table class="terms-table">
      <thead>
        <tr><th>제공 대상</th><th>제공 목적</th><th>제공 항목</th><th>보유 기간</th></tr>
      </thead>
      <tbody>
        <tr>
          <td>LiveKit Cloud</td>
          <td>라이브 방송 영상 송수신(WebRTC)</td>
          <td>사용자 고유 ID, 방 이름, 역할(판매자/구매자)</td>
          <td>방송 종료 즉시 삭제</td>
        </tr>
      </tbody>
    </table>

    <h2 class="terms-section-title">5. 이용자의 권리</h2>
    <ol class="terms-ol">
      <li>이용자는 언제든지 자신의 개인정보를 조회하거나 수정할 수 있습니다.</li>
      <li>이용자는 개인정보 처리에 대한 동의를 거부할 수 있습니다. 단, 일부 서비스 이용이 제한될 수 있습니다.</li>
      <li>이용자는 개인정보 삭제(탈퇴), 처리 정지 등을 요청할 수 있으며, 서비스는 법령에 따라 지체 없이 처리합니다.</li>
    </ol>

    <h2 class="terms-section-title">6. 개인정보 보호책임자 및 문의처</h2>
    <p>개인정보 처리에 관한 문의, 불만, 피해 구제는 아래 연락처로 문의하시기 바랍니다.</p>
    <ul class="terms-ul">
      <li>개인정보 보호책임자: 바로팜 운영팀</li>
      <li>이메일: privacy@barofarm.kr</li>
      <li>처리 기간: 접수 후 10영업일 이내</li>
    </ul>
    <p>기타 개인정보 침해에 관한 신고·상담은 개인정보 침해 신고센터(privacy.kisa.or.kr), 개인정보 분쟁조정위원회(www.kopico.go.kr)를 이용하실 수 있습니다.</p>

    <p class="terms-footer">본 방침은 2025년 1월 1일부터 시행됩니다.</p>
  `;
  page.appendChild(body);

  return page;
}
