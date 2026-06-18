# 게시판 토픽 글생성 — 출처 입력 기반 on-demand (Phase 0) 설계

- 작성일: 2026-06-18
- 상태: 설계 합의 완료 (구현 계획 대기)
- 한 줄: 손으로 기사 본문을 쓰던 자리를, **공식 출처 본문을 JSON으로 주면 OpenAI가 기사화**하는 on-demand 명령으로 대체한다(생성은 자동, 게시는 사람 검수 유지).

---

## 1. 배경 & 문제

- 게시판 글 생성에는 두 경로가 있다.
  - **OpenAI 경로:** `lib/board/generate.ts`(`generateDraft`) → `createDraft`. 매일 크론(`generate-board-posts.yml` → `runner.ts`)이 **정해진 공식 RSS 피드에서 하루 1건**만 생성. on-demand 1건용 `scripts/board/generate-topic.ts`도 존재하나 **출처가 코드에 하드코딩**(현재 청년 자산형성 통장)이라 주제마다 코드 수정이 필요해 사실상 재사용 불가.
  - **손작성 경로:** `insert-manual.ts` / `insert-batch.ts` / `insert-newborn-special-supply.ts` — 사람이 본문까지 직접 써서 `createDraft`에 넣음. OpenAI 미사용.
- 2026-06-18 게시판 오픈 시 기사 다수가 **손작성 경로**로 들어갔고, 그래서 OpenAI 통신은 (그날 크론 1건을 제외하면) 발생하지 않았다.
- **요구:** 앞으로는 손으로 본문을 쓰는 대신 **OpenAI 통신을 통해** 글을 생성하고 싶다.

## 2. 목표 & 범위

피드에 안 잡히는 임의 주제를, **사람이 공식 출처 본문을 제공**하면 OpenAI가 기사화해 DRAFT로 올리는 on-demand 도구를 만든다. 정확도·출처 원칙을 지키기 위해 **OpenAI는 제공된 출처 본문 안의 사실만** 쓰고(`generateDraft`의 기존 동작), **게시 전 사람 검수(/admin)는 그대로 필수**다.

### 핵심 사실 (설계를 좌우)
`generateDraft(client, { sourceText, sourceName }, model)`는 **'주제'를 인자로 받지 않는다.** OpenAI는 `sourceText`에 있는 사실만 기사로 만든다(추측·전망·추천 금지가 이렇게 강제됨). 따라서 "주제를 준다" = **"그 주제의 공식 출처 본문을 준다"**이다.

### 비범위 (이번에 안 함 — 후속 단계)
- **주제만 입력 → 자동 출처 검색**(Phase 2): 토픽→공식 URL 검색·본문 fetch·추출은 레포에 없고, 멀티위크 + 오선택 위험 + "네이버는 본문 사실에 절대 사용 안 함"이라는 4대 원칙과 충돌 소지가 있어 별도 단계로 분리. → 5절 로드맵.
- URL만 주면 본문 자동 fetch·추출(Phase 1).
- 자동 발행(사람 검수 생략). **이번에도, 앞으로도 자동 발행은 하지 않는다.**
- 어드민 UI 'AI로 생성' 버튼.

## 3. 핵심 결정 (확정)

| # | 결정 | 선택 |
|---|---|---|
| 트리거 | on-demand 명령(사람이 실행) | 확정 |
| 출처 입력 | **JSON 파일**(`scripts/board/topic-source.json`)에 본문+메타 작성 | 확정 |
| 생성 근거 | 제공된 `sourceText`만 사용(자기 지식 금지) — 기존 `generateDraft` 그대로 | 확정 |
| 모델 | `gpt-4.1`(짧은 출처에서 mini는 1000자 하한 미달) | 확정 |
| 게시 | 모든 결과 `status=DRAFT` → `/admin/posts` 사람 검수 후 발행 | 확정 |
| 처리 단위 | JSON 배열 → 1건·다건 동일 처리(항목별 독립) | 확정 |
| 구현 방식 | `generate-topic.ts`의 하드코딩 `SOURCE`를 파일 로드+루프로 교체. 나머지 100% 재사용 | 확정 |

## 4. 설계

### 4.1 입력 스키마 — `scripts/board/topic-source.json`

```jsonc
[
  {
    "detectedFrom": "topic:신생아-특별공급",   // 선택. 생략 시 "topic:manual"
    "sourceName": "국가법령정보센터",          // 필수, 비어있으면 거부(가드레일)
    "sourceUrl": "https://www.law.go.kr/...",  // 필수, dedupeKey 원천
    "sourceDate": "2026-06-15",                // 필수, "YYYY-MM-DD"(KST)
    "sourceText": "공식 문서 본문 전체 ..."     // 필수. 이 안의 사실만 기사가 됨
  }
]
```

- 실제 `topic-source.json`은 **gitignore**(매 실행 시 채우는 스크래치 입력). 형식 견본으로 `topic-source.example.json`을 커밋.
- `sourceDate` 문자열은 `new Date(\`${d}T00:00:00+09:00\`)`로 파싱(기존 코드와 동일한 KST 기준).

### 4.2 실행

```bash
# 생성·가드레일만 확인(DB 미기록)
pnpm tsx scripts/board/generate-topic.ts --dry-run
# 운영 DB(.env.local=Supabase)에 DRAFT 생성
pnpm exec dotenv -e .env.local -- tsx scripts/board/generate-topic.ts
# 파일 경로 지정(선택): 마지막 인자
pnpm tsx scripts/board/generate-topic.ts scripts/board/topic-source.json --dry-run
```

### 4.3 동작 흐름 (항목별)

```
JSON 로드 → 각 항목마다:
  [1] 입력 검증     sourceName/sourceUrl/sourceDate/sourceText 비어있으면 skip + 리포트
  [2] 생성          generateDraft(client, {sourceText, sourceName}, env.OPENAI_MODEL)
  [3] 가드레일      runGuardrails({body, sourceName, sourceUrl})  // 출처 필수·1000~2200자·금지표현
  [4] 저장          --dry-run? 로그만 : createDraft({ gen, sourceName, sourceUrl,
                      sourceDate, sourceExcerpt=sourceText.slice(0,4000),
                      dedupeKey: dedupeKey(sourceUrl), dateISO: kstDateISO(sourceDate), detectedFrom })
  [5] 리포트        [type/category] 제목 · 공백제외 글자수 · 가드레일 PASS/FAIL · created|duplicate|rejected
────── 여기까지 명령 / 아래는 수동 ──────
  [6] 검수          /admin/posts (Basic Auth) → 인라인 수정 → [게시]/[반려]
```

- **항목 독립:** 한 항목이 실패(검증/가드레일/rejected)해도 나머지는 계속 처리.
- **종료 코드:** 하나라도 실패하면 `process.exitCode = 1`(CI·로그에서 인지). `duplicate`는 실패 아님.
- **알림:** 생성된 건은 기존 `notify`로 "초안 N건 대기" 발송(기존 패턴 유지).

### 4.4 재사용 vs 변경

| 조각 | 재사용/변경 | 비고 |
|---|---|---|
| `lib/board/generate.ts` `generateDraft` | **재사용(무수정)** | `sourceText` 임의 입력 그대로 받음 |
| `lib/board/guardrails.ts` `runGuardrails` | **재사용(무수정)** | 출처 필수·분량·금지표현 |
| `lib/board/create-draft.ts` `createDraft` | **재사용(무수정)** | dedupe·slug·DRAFT 저장 |
| `scripts/ingest/posts/keys.ts` `dedupeKey`/`kstDateISO` | **재사용(무수정)** | |
| `scripts/ingest/notify.ts` | **재사용(무수정)** | |
| `scripts/board/generate-topic.ts` | **변경** | 하드코딩 `SOURCE` → JSON 파일 로드 + 항목 루프 + 입력 검증 |
| `scripts/board/topic-source.example.json` | **신규** | 입력 견본 |
| `.gitignore` | **변경** | `scripts/board/topic-source.json` 추가 |
| `.github/workflows/generate-board-topic.yml` | **변경(소폭)** | 4.5 참조 |

### 4.5 GitHub Actions 정합성

현재 `generate-board-topic.yml`은 하드코딩 SOURCE를 돌리는 전제다. 리팩터 후 JSON 파일이 없으면 깨지므로:

- **Phase 0의 1차 사용처는 로컬 CLI**(오늘 작업도 `dotenv -e .env.local`로 로컬 실행했음).
- 워크플로는 **`topic-source.json`이 없으면 "입력 파일 없음 — no-op"로 명확히 안내하고 정상 종료**하도록 맞춘다(워크플로 실패로 오인 방지). 긴 본문을 Actions UI에 붙여넣는 UX는 Phase 0 범위 밖.

## 5. 후속 로드맵 (이번 범위 아님, 기록용)

| 단계 | 내용 | 비용/리스크 |
|---|---|---|
| **Phase 0 (이 문서)** | 주제 + 출처 본문(JSON) → 생성 | 시간 / ≈0 |
| Phase 1 | 주제 + 출처 **URL만** → 도구가 본문 fetch·추출 | 며칠 / 중(JS렌더·EUC-KR·리다이렉트·추출기 신규) |
| Phase 2 | **주제만** → 공식 도메인 화이트리스트 한정 자동 검색(플래그) | 수 주 / 높음(오선택·원칙 충돌) |
| Phase 3 | Playwright 렌더 폴백, 출처-본문 일치 검증 | 선택 |

모든 단계에서 **DRAFT → 사람 검수 → 발행** 게이트는 불변(안전망).

## 6. 성공 기준 (검증)

1. `topic-source.json`에 출처 1건을 넣고 `--dry-run` 실행 → 생성된 `[type/category] 제목`과 공백제외 글자수, 가드레일 PASS/FAIL가 출력된다(DB 미기록).
2. 실제 실행 시 해당 출처가 `status=DRAFT`로 1건 생성되고 `/admin/posts`에 뜬다. `sourceName/sourceUrl/sourceDate/sourceExcerpt`가 채워져 있다.
3. 같은 `sourceUrl`로 재실행 → `duplicate`로 건너뛴다(중복 미생성).
4. 배열에 2건 이상 + 일부가 가드레일 실패여도, 통과 건은 생성되고 실패 건만 리포트되며 종료 코드는 1이다.
5. 손작성 본문(`GEN`)을 더는 직접 쓰지 않는다 — 본문은 OpenAI가 `sourceText`로부터 생성한다.
6. 변경은 위 4.4 표의 파일에 한정된다(기존 생성·가드레일·저장 로직 무수정).
