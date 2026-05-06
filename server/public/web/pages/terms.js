/**
 * Terms of Service Page — 4-1b-F
 * 바로팜 서비스 이용약관
 *
 * @module pages/terms
 */

// Inject CSS once
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
    <h1 class="terms-header__title">이용약관</h1>
  `;
  header.querySelector('.terms-header__back').addEventListener('click', () => window.history.back());
  page.appendChild(header);

  const body = document.createElement('div');
  body.className = 'terms-body';
  body.innerHTML = `
    <p class="terms-meta">시행일: 2025년 1월 1일 &nbsp;|&nbsp; 바로팜 운영팀</p>

    <h2 class="terms-section-title">제1조 (목적)</h2>
    <p>이 약관은 바로팜(이하 "서비스")이 제공하는 산지직송 라이브 커머스 서비스의 이용에 관한 권리·의무 및 절차를 규정함을 목적으로 합니다.</p>

    <h2 class="terms-section-title">제2조 (정의)</h2>
    <ol class="terms-ol">
      <li>"회원"이란 본 약관에 동의하고 서비스에 가입한 자를 말합니다.</li>
      <li>"판매자"란 서비스를 통해 라이브 방송 및 경매를 진행하는 회원을 말합니다.</li>
      <li>"구매자"란 라이브 방송을 시청하고 경매에 참여하는 회원을 말합니다.</li>
      <li>"라이브 방송"이란 판매자가 실시간으로 상품을 소개하고 경매를 진행하는 영상 서비스를 말합니다.</li>
      <li>"낙찰"이란 경매 종료 시 최고가 입찰자가 상품 구매권을 획득하는 행위를 말합니다.</li>
    </ol>

    <h2 class="terms-section-title">제3조 (약관의 게시와 개정)</h2>
    <ol class="terms-ol">
      <li>서비스는 본 약관을 앱 내 설정 화면에 게시합니다.</li>
      <li>서비스는 관련 법령에 위배되지 않는 범위에서 약관을 개정할 수 있으며, 개정 시 시행 7일 전에 공지합니다.</li>
      <li>회원이 개정 약관 시행일 이후에도 서비스를 계속 이용하는 경우 개정 약관에 동의한 것으로 간주합니다.</li>
    </ol>

    <h2 class="terms-section-title">제4조 (서비스의 제공)</h2>
    <ol class="terms-ol">
      <li>서비스는 산지직송 농산물 라이브 경매, 채팅, 관심 저장 기능을 제공합니다.</li>
      <li>서비스는 시스템 점검, 장애, 천재지변 등의 사유로 서비스를 일시 중단할 수 있습니다.</li>
      <li>서비스는 서비스 내용을 변경할 경우 사전에 공지합니다.</li>
    </ol>

    <h2 class="terms-section-title">제5조 (회원가입 및 탈퇴)</h2>
    <ol class="terms-ol">
      <li>회원가입은 이름 및 휴대폰 번호를 입력하여 진행합니다.</li>
      <li>만 14세 미만은 서비스를 이용할 수 없습니다.</li>
      <li>회원은 언제든지 서비스 내 탈퇴를 신청할 수 있으며, 탈퇴 즉시 회원 정보는 삭제됩니다. 단, 낙찰 거래 기록은 관련 법령에 따라 일정 기간 보관됩니다.</li>
      <li>다음에 해당하는 경우 서비스는 가입을 거부하거나 해지할 수 있습니다: ① 타인 명의 도용, ② 허위 정보 기재, ③ 서비스 운영을 방해하는 행위.</li>
    </ol>

    <h2 class="terms-section-title">제6조 (라이브 방송 및 경매)</h2>
    <ol class="terms-ol">
      <li>판매자는 실제 판매 가능한 농산물에 한해 라이브 방송을 진행해야 합니다.</li>
      <li>허위·과장 광고, 타인 상품 도용, 불법 상품 판매는 금지됩니다.</li>
      <li>경매는 판매자가 설정한 시작가와 경매 시간을 기준으로 진행되며, 시간 내 최고가 입찰자가 낙찰됩니다.</li>
      <li>경매 진행 중 입찰은 취소할 수 없습니다.</li>
      <li>서비스는 채팅 및 경매 시스템을 제공할 뿐 거래 당사자가 아니며, 판매자와 구매자 간 분쟁에 직접적인 책임을 지지 않습니다.</li>
    </ol>

    <h2 class="terms-section-title">제7조 (낙찰 및 결제)</h2>
    <ol class="terms-ol">
      <li>낙찰자는 낙찰 후 서비스가 안내하는 기한 내에 결제를 완료해야 합니다.</li>
      <li>결제 미완료 시 낙찰이 취소될 수 있으며, 반복 미결제 시 서비스 이용이 제한될 수 있습니다.</li>
      <li>배송은 판매자가 직접 처리하며, 서비스는 배송에 대한 책임을 지지 않습니다.</li>
      <li>낙찰 취소·환불은 판매자와 구매자 간 협의에 따르며, 서비스는 중재 역할을 할 수 있습니다.</li>
    </ol>

    <h2 class="terms-section-title">제8조 (이용 제한)</h2>
    <ol class="terms-ol">
      <li>서비스는 다음에 해당하는 회원에 대해 이용을 제한하거나 탈퇴 처리할 수 있습니다:</li>
      <li>① 타인 명의 도용 또는 허위 정보 기재</li>
      <li>② 서비스의 안정적 운영을 방해하는 행위 (스팸, 해킹, 비정상적 입찰 등)</li>
      <li>③ 법령 또는 공공질서를 위반하는 행위</li>
      <li>④ 판매자로서 허위 상품을 등록하거나 낙찰 후 배송을 이행하지 않는 행위</li>
    </ol>

    <h2 class="terms-section-title">제9조 (분쟁 해결)</h2>
    <ol class="terms-ol">
      <li>서비스 이용으로 발생한 분쟁은 서비스 고객센터를 통해 우선 해결합니다.</li>
      <li>소송이 필요한 경우 서비스 본사 소재지 관할 법원을 전속 관할로 합니다.</li>
      <li>본 약관에 명시되지 않은 사항은 관련 법령 및 상관례에 따릅니다.</li>
    </ol>

    <p class="terms-footer">문의: barofarm@barofarm.kr &nbsp;|&nbsp; 고객센터: 운영시간 내 앱 내 채팅 이용</p>
  `;
  page.appendChild(body);

  return page;
}
