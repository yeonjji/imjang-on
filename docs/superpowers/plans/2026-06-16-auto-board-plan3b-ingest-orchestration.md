# 플랜 3b — 자동 게시판 수집·오케스트레이션

- 작성일: 2026-06-16
- 선행: 플랜 3a(생성 코어 `lib/board/{generate,guardrails,create-draft,slug}.ts`) 완료
- 설계: `docs/superpowers/specs/2026-06-15-auto-board-content-pipeline-design.md`
- 한 줄: 검증된 공공 RSS에서 보도자료를 모아 화제성으로 1건 골라 초안(DRAFT)을 만들고 알림한다. (feed-first)

## 결정 (이번 플랜에서 확정)
- **순서: feed-first** (RSS 보도자료 풀 → 키워드/부처 필터 → 네이버 뉴스 화제성 랭킹 → 1위 1건 → 생성). 설계 원문 topic-first에서 변경(검증된 korea.kr RSS 확보 때문).
- **하루 1건**: 첫 유효 초안 1개가 만들어지면 중단. 매칭/유효 후보 0이면 0건이 정상.
- **소스 본문**: korea.kr RSS `<description>`에 보도자료 전문이 HTML로 들어옴(라이브 검증). 별도 기사 페이지 크롤 불필요 — HTML 태그만 제거해 sourceText로 사용.
- **네이버 화제성은 랭킹 신호이며 graceful**: 자격증명 없거나 실패하면 최신순 폴백(파이프라인 안 멈춤). 뉴스 본문은 절대 사용 안 함(탐지 신호만) — 설계 4대 원칙 유지.

## 검증된 1차 레지스트리 (RSS, 라이브 확인)
| key | 기관 | RSS | 비고 |
|---|---|---|---|
| `korea` | 정책브리핑(전부처) | `https://www.korea.kr/rss/pressrelease.xml` | 제목 `[기관명]…` 접두어, description=전문. 국토부/금융위/기재부 등 부처 커버 |
| `bok` | 한국은행 | `https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690` | 금리·통화정책. korea.kr 미포함(중앙은행) |

확장 후보(레지스트리 한 줄 추가): 기재부 직접/통계청/금융위 직접 RSS(모두 HTTP 전용, 서버사이드 OK). 금감원·부동산원·청약홈은 RSS 없음/JS 렌더 → 제외(부동산원 통계는 기존 OpenAPI로 별도).

## 관련도 필터 (korea.kr 전부처 → 부동산·금융만)
- 부처 화이트리스트: 국토교통부, 금융위원회, 기획재정부, 국세청, 한국은행 등
- 키워드(OR): 부동산·주택·아파트·분양·청약·전세·임대·재건축·재개발·대출·금리·주담대·디딤돌·보금자리·LTV·DSR·종부세·양도세·취득세 등
- 부처 화이트리스트 ∧ (또는 ∨) 키워드 매칭으로 후보 선별. 카테고리 힌트(FINANCE/LOAN/ECONOMY/SUBSCRIPTION/REALESTATE)는 키워드 매핑으로 1차 추정(최종 분류는 LLM).

## 컴포넌트
| 파일 | 책임 | 테스트 |
|---|---|---|
| `lib/board/feed-registry.ts` | 검증 RSS 레지스트리(SSOT) | 순수—구조 검사 |
| `scripts/ingest/posts/rss.ts` | RSS fetch+파싱 → FeedItem{agency,title,link,pubDate,bodyText} (HTML strip, `[기관]` 접두어 분리) | 순수 파싱 단위테스트(고정 XML) |
| `scripts/ingest/posts/relevance.ts` | 부처/키워드 필터 + 카테고리 힌트 | 순수 단위테스트 |
| `scripts/ingest/posts/detect-issues.ts` | 네이버 뉴스 검색 → 화제성 점수(query→최근 뉴스 건수). graceful | fetch 주입형, 폴백 테스트 |
| `scripts/ingest/posts/runner.ts` | 오케스트레이션: feeds→필터→dedupe→랭킹→top1→createDraft→IngestionRun→notify | 통합(로컬DB) |
| `.github/workflows/generate-board-posts.yml` | 크론 하루 1회(KST 오전) | — |

## 흐름 (runner)
1. 레지스트리 각 RSS fetch → FeedItem[] 합치기.
2. `relevance` 필터로 부동산·금융 후보만.
3. dedupe: `dedupeKey = sha256(sourceUrl)` 가 이미 Post에 있으면 제외(생성 전 차단).
4. 네이버 화제성 랭킹(실패 시 pubDate 최신순).
5. 상위부터 순회: `createDraft` 호출(분류+생성+가드레일+dedupe insert). 첫 `created` 나오면 중단.
6. `IngestionRun`(source='board', targetKey='all') 기록 + `notify`('info', '오늘 초안 N건 대기', {created, slug, candidates, skipped, rejected}).
7. 실패는 잡 실패로 종료(Actions가 잡도록), 단 후보 0/생성 0은 정상.

## 가드레일·원칙 (불변)
- LLM 입력 = 보도자료 텍스트 + 규칙만(자기지식 금지). 근거 없으면 글 없음.
- 자동은 DRAFT까지만. 게시는 사람.
- 생성·가드레일은 3a 그대로 재사용(이미 기사형 프롬프트 + 분량 1200~2000 적용됨).

## 배포
- 운영 DB: Post/Enum 마이그레이션 미적용 → 머지/배포 시 적용(`feedback_prisma_migration_staging` 주의: 새 폴더만 좁게 add 후 deploy, status 확인).
- `OPENAI_API_KEY`/`NAVER_SEARCH_*`/`DISCORD_WEBHOOK_URL` = Actions Secret(등록됨). 공개 런타임 OpenAI 미호출.

## 구현 순서 (TDD 우선, 순수 로직부터)
1. `rss.ts` + 단위테스트(고정 korea.kr/bok XML 샘플 파싱·HTML strip·접두어 분리)
2. `relevance.ts` + 단위테스트
3. `feed-registry.ts`
4. `detect-issues.ts`(네이버) + 단위테스트(fetch 주입·폴백)
5. `runner.ts` 통합
6. 워크플로우 yml
7. 전체 테스트·타입체크·빌드 → 커밋
