# 임장온 게시판 — 주제 던지기 근거 발견 확장 (Grounding Discovery)

- 날짜: 2026-07-07
- 상태: 설계 승인 대기
- 범위: 어드민 "주제 던지기" 글 생성의 **근거 수집(discovery)** 경로. 자동 일일 러너 피드 흐름은 범위 밖.

## 1. 배경 & 문제

어드민이 `/admin/posts`에서 주제를 던지면(`generateFromTopicAction` → `researchTopic`) 흐름은:

1. 네이버 웹문서 검색(`webkr`) 20건
2. **허용 도메인 필터** — `korea.kr` · `*.go.kr` · `bok.or.kr` **딱 이것만**
3. 본문 추출 → **공공누리 제1유형/무표시 + 800자 이상**만 usable
4. usable 0건이면 `grounded: null` → `insufficient` → "공공누리 이용가능 근거를 찾지 못했습니다"

**관찰된 실패 양상**: `insufficient`일 때 어드민 화면의 "걸러진 후보" 목록이 **거의 비어 있음**(0~1건). 즉 게이트(도메인·공공누리·길이)에서 걸러지기 *전에* 이미 네이버 웹검색이 공식 페이지를 top-20에 안 물어온다.

**근본 원인 = 발견(discovery) recall.** 프롬프트도, 라이선스 게이트도 아니다. 임의 주제로 네이버 웹문서를 치면 top-20이 뉴스·블로그·카페로 채워지고 `.go.kr`/korea.kr은 거의 안 올라온다.

관련 파일:
- `lib/board/research.ts` — `researchTopic` (탐색+게이트+병합)
- `lib/board/source-policy.ts` — `isAllowedDomain` 화이트리스트, 공공누리 판정
- `lib/board/generate.ts` — `SYSTEM_PROMPT`(규칙 #1), `buildUserPrompt`
- `app/admin/posts/actions.ts` — `generateFromTopicAction`

## 2. 성공 기준

- 주제를 던졌을 때 `insufficient`(근거 못 찾음) 발생률이 **대폭 감소**.
- **최근 이슈 주제와 에버그린(상시) 주제 양쪽** 모두 커버.
- 유지: 공식/공공저작물 출처만 사용, 출처별 캡션(`[출처: … · 공공누리 … · URL]`), 공공누리 게이트, 게시 전 사람 검수, 프롬프트의 추측·의견 금지.

## 3. 핵심 발견 (설계 제약)

- 환경에 **Google API 키 없음**. `PUBLIC_DATA_KEY`(data.go.kr 공공데이터포털 키) **있음**.
- **korea.kr 정책브리핑 정책뉴스 API** 존재:
  - 엔드포인트: `http://apis.data.go.kr/1371000/policyNewsService/policyNewsList`
  - 인증: `serviceKey`(= `PUBLIC_DATA_KEY`)
  - 요청 파라미터: `serviceKey`, `startDate`(YYYYMMDD), `endDate`(YYYYMMDD) — **키워드 검색 없음, 날짜 범위만**
  - 응답: **본문 전체(`DataContents`, 최대 10만자)**, **원문 URL(`OriginalUrl`)**, 제목, 부처명, 승인일, 이미지 URL
- 따라서 Google CSE 없이 이 API로 **최근 정책뉴스 코퍼스를 날짜창으로 받아 로컬 키워드 매칭**이 가능. 결과가 전부 korea.kr → 이미 허용·공공누리 무난·본문 충분.

## 4. 아키텍처

두 갈래 탐색 계층 + 병합. `researchTopic`이 둘을 호출해 기존 `GroundedResult` 형태로 합친다.

### 4.1 B-주력 (신규): korea.kr 정책뉴스 코퍼스

신규 모듈 `lib/board/sources/korea-news.ts`.

- **입력**: `topic`, `today`, window 길이(기본 90일).
- **수집**: `startDate = today - 90d`, `endDate = today`로 `policyNewsList` 페이지네이션 호출(`PUBLIC_DATA_KEY`). 자격증명/오류 시 빈 배열(graceful, 기존 `searchTopic` 패턴과 동일).
- **캐시**: 날짜창 firehose를 매 요청마다 재수신하지 않도록 **윈도우 단위 단기 인메모리 캐시**(TTL ~수십 분). 키 = `startDate|endDate`. 프로세스 로컬로 충분(어드민 저빈도 사용).
- **로컬 키워드 매칭**: 주제를 토큰화(공백/조사 단순 분리) → 각 기사에 스코어 = 제목 매칭(가중 ↑) + 본문 매칭. 임계 이상 상위 N건(예: 3건) 채택. 매칭 0건이면 빈 배열.
- **출력**: `SourceMeta`(domain=`korea.kr`, `koglType='unknown'`→usable, chars, title, url=`OriginalUrl`) + 본문 텍스트. 800자 문턱은 사실상 항상 통과.

### 4.2 A-보완 (개선): 네이버 웹검색

기존 `research.ts`의 네이버 경로를 개선.

- **멀티쿼리**: `주제` 단일 호출 대신 소수의 공식 편향 변형을 함께 검색 후 합집합·중복제거. 변형 예: `주제`, `주제 보도자료`, `주제 제도`, `주제 지원`. 호출 수는 상한(예: 4개)으로 레이턴시 통제. 각 호출은 기존 `searchTopic` 재사용.
- **화이트리스트 확장** (`source-policy.ts`): `.go.kr` 밖 **검증된 공공기관 호스트를 개별 등재**(와일드카드 금지 — 기존 주석 원칙 유지). 초기 등재 후보:
  - 통계청 국가통계포털 `kosis.kr`
  - 한국부동산원 `reb.or.kr` / `www.reb.or.kr`
  - 주택도시보증공사(HUG) `khug.or.kr`
  - 국토연구원 `krihs.re.kr`
  - 한국개발연구원(KDI) `kdi.re.kr`
  - (검토 후 확정: 각 호스트는 실제 공공기관 공식 도메인인지 개별 확인)
  - 민간 협회·재단 `.or.kr`/`.re.kr`은 **계속 배제**.
  - 확장 도메인은 `DOMAIN_LABEL`에도 라벨 추가(출처 캡션용).
- **게이트 불변**: `detectKoglType`·`isUsableLicense`·`MIN_SOURCE_CHARS`는 그대로. 검증된 도메인 집합만 넓힌다.

### 4.3 병합 & 랭킹

- korea.kr 매칭 + 네이버 허용 매칭을 하나의 `SourceMeta[]`로 합침.
- 기존 `rankUsable`(korea.kr 우선 → 본문 길이 내림차순) 유지. korea.kr 코퍼스 결과가 자연히 앞에 온다.
- usable 상위들을 `[출처: {라벨} · {공공누리} · {URL}]\n{본문}` 헤더로 이어 `sourceText`(상한 `MAX_SOURCE_TEXT_CHARS`) 조립 — 기존 방식 그대로. 대표 출처(`rep`) = usable[0].
- `used`/`candidates`는 두 경로 합산. `insufficient` 판정은 여전히 usable 0건일 때만.

### 4.4 프롬프트 (소폭)

`generate.ts` `SYSTEM_PROMPT` 규칙 #1을 단일 덩어리 전제에서 **다출처 전제**로 조정:

- 현재: "제공된 '근거 자료'에 있는 사실만 쓴다. 자료에 없는 내용은 절대 추측·추가하지 않는다."
- 변경 취지: "제공된 **여러 근거 자료**에 있는 사실만 쓴다. 각 사실은 해당 자료에 근거한다. 자료에 없는 내용은 절대 추측·추가하지 않는다."
- "의견성 문장 금지 / 수치·날짜 원문 그대로 / 참고 자료 섹션" 등 나머지는 **불변**.
- `buildUserPrompt`는 이미 `sourceText`에 출처 헤더가 포함되므로 구조 변경 불필요(문구만 다출처를 자연스럽게 반영).

## 5. 데이터 흐름

```
topic
 ├─(B) korea.kr policyNewsList[90d] → 캐시 → 로컬 키워드 매칭 → top N (전부 usable)
 └─(A) 네이버 멀티쿼리 → 허용 도메인 필터(확장) → fetch+extract → KOGL·길이 게이트 → usable
        ↓ 병합 · rankUsable
   usable[] → sourceText(출처 헤더) → generateDraft → createDraft(status=DRAFT) → 어드민 검수 → publish
```

## 6. 유지되는 원칙 & 폴백

- 공식/공공저작물 출처만, 출처별 캡션, 공공누리 게이트, 게시 전 사람 검수, 프롬프트 추측·의견 금지 — 전부 유지.
- 붙여넣기(pasted source) 폴백 그대로. `insufficient`는 여전히 가능하지만 훨씬 드묾.
- 에버그린 주제: korea.kr 90일 창을 벗어나면 A(네이버+확장 화이트리스트)와 붙여넣기 폴백이 받는다.

## 7. 테스트

- `tests/lib/board-korea-news.test.ts` (신규): 픽스처 `policyNewsList` 응답 → 파싱(본문/URL/제목), 키워드 매처 스코어·임계·top N, 자격증명 없음/HTTP 오류 시 빈 배열(graceful).
- `tests/lib/board-source-policy.test.ts` (확장): 새 허용 호스트(kosis.kr·reb.or.kr·khug.or.kr 등) 허용, 임의 민간 `.or.kr` 여전히 거부, 라벨 매핑.
- `tests/lib/board-research.test.ts` (확장): korea.kr 매칭 + 네이버 매칭 병합 → grounded, korea.kr 우선 랭킹, 양쪽 0건 → `grounded: null`.
- 네트워크는 `fetchImpl` 주입으로 fake(기존 `ResearchDeps` 패턴).

## 8. 범위 밖 (YAGNI)

- **Google CSE** — 키 없음·불필요.
- **자동 일일 러너 피드 흐름**(`scripts/ingest/posts/runner.ts`) — 이미 동작, 안 건드림. 단 `researchTopic`을 공유한다면 개선 이득은 자연 전파.
- **korea.kr 코퍼스 DB 적재**(누적 검색) — 에버그린 심화용 후속 후보로만 메모. MVP는 온디맨드 90일 창 + 인메모리 캐시.
- **적응형 날짜창 확장(90→365일)** — 후속 후보. MVP는 고정 90일.

## 9. 열린 항목 (구현 중 확정)

- 키워드 토큰화·스코어링 세부(제목 가중치, 임계값, top N) — 구현 중 소규모 스파이크로 튜닝.
- 확장 화이트리스트 최종 목록 — 각 호스트 공식 도메인 여부 개별 확인 후 확정.
- korea.kr 캐시 TTL 구체값.

## 10. 법적 근거 · 리스크 · 방어막

**원칙: 이 변경은 라이선스 근거를 느슨하게 하지 않는다. 공공 오픈 API를 신설하고, 검증된 공공기관 도메인만 개별 확장하며, 공공누리 제한 게이트는 그대로 둔다.**

### 변경별 법적 근거
- **korea.kr 정책뉴스 API (주력)**: 정부가 data.go.kr에 **오픈 API로 공식 제공**하는 재사용 목적 콘텐츠. `PUBLIC_DATA_KEY`는 그 목적의 정식 발급 키. 현행 네이버 웹검색→페이지 추출보다 재사용 근거가 더 명확하다.
- **화이트리스트 확장(부동산원·통계청·HUG·국토연구원·KDI 등)**: **공공기관** 저작물 → **저작권법 제24조의2(공공저작물 자유이용)**. 프로젝트가 현재 `unknown` 케이스에 이미 적용 중인 근거와 동일.
- **네이버 멀티쿼리·프롬프트**: 라이선스 게이트 불변. 검색어만 늘고, 사용 가부는 도메인 필터 + 공공누리 게이트가 결정. 뉴스 도메인은 전부 배제 → 언론 저작권 미접촉.

### 유지되는 방어막
- 공공누리 **제한유형(2·3·4) 탐지 게이트 불변** — 상업금지·변형금지 표시 콘텐츠 배제.
- **와일드카드 금지** — `.or.kr`/`.re.kr` 통째 개방 아님. 검증된 공공기관 호스트만 개별 등재(민간 협회·재단 배제).
- **게시 전 사람 검수**(DRAFT → 어드민 publish) 유지.

### 남는 리스크 & 완화
- **표시 안 된 제3자 콘텐츠**: 공공기관 페이지도 사진·인용·라이선스 데이터 등 제3자 저작물을 품을 수 있음. 공공누리 탐지기는 *표시된* 제한만 잡는다. → 완화: (a) 각 확장 도메인 개별 확인, (b) 게시 전 사람 검수.
- 본 문서는 법률 자문이 아님. 상업 서비스(AdSense) 기준으로도 "공공 오픈 API + 공공저작물 + 공공누리 제한 존중 + 사람 검수"는 보수적으로 안전한 조합.
