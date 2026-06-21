# 관리 프로젝트

이 디렉터리는 바로팜과 별개로 새로운 관리형 프로젝트를 진행하기 위한 초기 공간입니다.

## 용도

- 새로운 도메인 또는 관리용 툴 개발
- 바로팜과 분리된 프로토타입/관리 인터페이스 보관
- 별도 문서, 설계, 테스트 코드 저장

## 시작하기

1. 이 폴더를 새로운 Git 브랜치나 별도 저장소로 사용할 수 있습니다.
2. 필요하면 `management/app`, `management/server`, `management/docs` 같은 하위 구조를 추가합니다.
3. 우선 `README.md`를 기반으로 초기 기획을 정리하세요.

## 현재 프로토타입

`management` 디렉터리에는 지역명을 입력하면 주변 액티비티 장소를 추천해주는 웹 페이지 샘플이 포함되어 있습니다.

- `management/index.html`
- `management/styles.css`
- `management/app.js`

### 실행 방법

1. `management/index.html` 파일을 브라우저에서 열거나,
2. 간단한 로컬 서버를 사용할 경우:
   - `python -m http.server 8000` (Python 설치된 경우)
   - 브라우저에서 `http://localhost:8000` 접속

> 실제 장소 API를 사용하므로, 로컬 서버에서 실행하면 더 안정적으로 동작합니다.

### 기능

- 지역 또는 역 이름 입력 후 추천 버튼 클릭
- 실제 장소 API(OpenStreetMap Nominatim + Overpass) 연동
- 2km 이내 실제 장소를 검색해 추천 결과 표시
- 인원 수 입력 시 해당 인원을 수용 가능한 장소만 필터링
- 입력한 위치의 실제 장소를 기준으로 결과를 보여줍니다
- 입력한 지역이 정확하게 검색되지 않거나 결과가 없으면 안내 메시지 표시

### 향후 확장

- 실제 장소 API(OpenStreetMap, Google Places 등) 연동
- 지역 자동 완성 검색
- 맵 뷰와 거리 기반 추천
- 장소별 평점/카테고리 필터
