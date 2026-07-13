# 게시판 참조글 90일 나이 필터

작성일: 2026-07-13

## 배경 / 문제

주간 자동 게시판 생성기(`generate-board-posts.yml` → `scripts/ingest/posts/runner.ts`)는
후보 기사를 **최신순으로 정렬(rank)만** 하고, 오래된 후보를 **걸러내지 않는다**.
최신 후보가 적은 주에는 몇 달 전 RSS 항목·네이버 뉴스가 그대로 선택돼
**옛날 기사 기반 글**이 생성된다.

- korea.kr 리서치 경로(`/admin/posts` → `researchTopic`)는 이미 `LOOKBACK_DAYS = 30`으로 30일 제한 → 정상.
- 네이버 웹문서 경로는 API가 발행일을 주지 않아 나이로 거를 수 없음.

## 결정 (확정)

- 나이 상한: **90일**(발행일 있는 RSS·네이버뉴스 후보에 적용).
- 발행일 없는 후보: **버림**(보수적 — 나이를 보증할 수 없으므로).
- korea.kr `LOOKBACK_DAYS = 30`: **유지**(변경 없음).
- 적용 범위: **자동 생성기(runner) + 어드민 메타데이터 경고**.

## Part A — 자동 생성기 90일 필터 (핵심)

### 신규 모듈: `scripts/ingest/posts/freshness.ts`

순수 함수로 분리한다. `runner.ts`는 import 시 `main()`이 실행돼 직접 단위 테스트가 불가하므로,
나이 판정 로직만 별도 모듈로 빼서 테스트한다(기존 `rss.ts`·`detect-issues.ts` 패턴과 동일).

```ts
export const MAX_SOURCE_AGE_DAYS = 90;

/** pubDate가 now 기준 MAX_SOURCE_AGE_DAYS 이내면 true. null이면 false(나이 보증 불가). */
export function isFresh(pubDate: Date | null, now: Date): boolean;

/** 나이 초과·발행일 없음 후보를 제외. staleDropped = 제외된 개수(관측용). */
export function dropStale(
  cands: BoardCandidate[],
  now: Date,
): { kept: BoardCandidate[]; staleDropped: number };
```

경계: `now - pubDate <= 90일`이면 통과(정확히 90일은 포함). 미래 날짜(now보다 이후)도 통과.

### `runner.ts` 배선

후보 병합 직후, `dropExisting` 앞에 한 줄 추가:

```
candidates(병합) → dropStale(90일) → dropExisting(중복) → rank → 생성
```

- 청약(subscription) 후보는 `pubDate = 오늘`이라 항상 통과.
- `staleDropped` 개수를 `summary`·`notify`에 기록 → **조용한 누락 방지**
  (며칠에 몇 건이 나이로 잘렸는지 관측 가능).

## Part B — 어드민 메타데이터 경고 (부수)

네이버 웹문서는 발행일을 알 수 없어 필터가 불가 → 필터 대신 **경고 표시**.

- `lib/board/research.ts`: `GroundedResult`에 `repDateKnown: boolean` 추가.
  대표 근거(`rep`)가 korea.kr(`korea.kr`/`www.korea.kr`)이면 `true`, 네이버 웹문서면 `false`.
- `app/admin/posts/actions.ts`: `TopicGenResult`의 `created`에 `sourceDateKnown: boolean` 추가해 전달.
  붙여넣기 경로는 사람이 직접 넣으므로 `true`.
- `app/admin/posts/new-post-form.tsx`: 생성 성공 메시지 아래, `sourceDateKnown === false`일 때 한 줄 경고:
  "⚠ 대표 근거가 네이버 웹문서라 발행일 미확인 — 검수 시 최신성 확인 요망".

## 손대지 않는 것

- korea.kr `LOOKBACK_DAYS = 30` (유지).
- `scripts/board/generate-topic.ts` (하드코딩 SOURCE, 사람이 지정).
- 랭킹 로직·가드레일·Prisma 스키마 (나이 필터는 순수 추가, 스키마 변경 없음).

## 검증

- 신규 `tests/ingest/posts-freshness.test.ts`:
  발행일 null 제외 / 90일 초과 제외 / 90일 이하 유지 / 경계값(정확히 90일) / staleDropped 카운트.
- `tests/lib/board-research.test.ts`: 대표 근거별 `repDateKnown` 단언 추가.
- `pnpm test && pnpm lint && pnpm typecheck` 통과 확인 후 완료.
