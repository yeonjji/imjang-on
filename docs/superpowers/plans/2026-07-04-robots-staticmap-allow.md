# `/api/staticmap` robots 예외 허용 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네이버·구글 크롤러가 `/api/staticmap` 지도 이미지(JSON-LD 대표 이미지·썸네일)를 수집할 수 있도록 robots.txt에서 `/api/`의 이 한 경로만 예외 허용한다.

**Architecture:** `app/robots.ts`의 `allow` 배열에 `/api/staticmap` 한 항목을 추가한다. `userAgent: '*'`와 `'Yeti'` 두 룰이 같은 `allow` 상수를 공유하므로 한 번 추가로 둘 다 적용된다. longest-match(14>5 옥텟)로 `/api/staticmap`만 열리고 나머지 `Disallow: /api/`는 유지된다. 회귀 방지를 위해 순수 함수 `robots()`의 출력 규칙을 검증하는 유닛 테스트를 추가한다.

**Tech Stack:** Next.js 15.5.18 (`MetadataRoute.Robots`), TypeScript, Vitest, pnpm.

## Global Constraints

- 패키지 매니저는 **pnpm** (Node.js 20).
- **완료 게이트: `pnpm lint` 0 경고/에러** — ESLint `no-unused-vars`가 error라 CI lint를 막는다. typecheck는 미사용 변수를 못 잡으니 lint를 반드시 통과시킬 것.
- **테스트 배치 제약:** `package.json`의 `test:unit`은 `vitest run tests/lib tests/ingest tests/components`로 이 세 디렉토리만 실행한다. 새 테스트는 반드시 **`tests/lib/`** 아래에 둘 것 (`tests/app/`에 두면 CI에서 조용히 미실행).
- 기존 코드 스타일을 따를 것: `app/robots.ts`의 `allow`는 **한 줄 배열 형식 유지**, 예외 이유만 위에 주석으로.
- 폴백(route를 `/api` 밖으로 이전)은 **이번 구현 대상이 아니다** — 스펙에 문서화만 되어 있음.

---

### Task 1: `/api/staticmap` robots 예외 + 회귀 테스트

**Files:**
- Create: `tests/lib/robots.test.ts`
- Modify: `app/robots.ts:6` (`allow` 상수)

**Interfaces:**
- Consumes: `app/robots.ts`의 default export `robots(): MetadataRoute.Robots`. 반환 형태 `{ rules: Rule | Rule[], sitemap: string }`, 각 `Rule = { userAgent: string, allow: string | string[], disallow: string | string[] }`.
- Produces: `robots()`의 모든 룰에서 `allow`가 `'/api/staticmap'`을 포함하고 `disallow`가 `'/api/'`를 유지. (후속 태스크 없음.)

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/robots.test.ts` 생성:

```ts
import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

describe('robots.txt', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

  it('모든 룰에서 /api/staticmap 을 허용한다', () => {
    for (const rule of rules) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
      expect(allow, `rule for ${String(rule.userAgent)}`).toContain('/api/staticmap');
    }
  });

  it('/api/ 전반은 계속 차단한다', () => {
    for (const rule of rules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow, `rule for ${String(rule.userAgent)}`).toContain('/api/');
    }
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm exec vitest run tests/lib/robots.test.ts`
Expected: 첫 번째 테스트("/api/staticmap 을 허용한다") **FAIL** (`allow`에 `/api/staticmap` 없음). 두 번째("/api/ 전반은 계속 차단한다")는 PASS.

- [ ] **Step 3: 최소 구현 — `allow`에 예외 추가**

`app/robots.ts`의 6번째 줄

```ts
  const allow = ['/', '/apt/', '/officetel/', '/villa/', ...(isBoardPublic() ? ['/board/'] : [])];
```

을 아래로 교체 (한 줄 형식 유지 + 위에 이유 주석 1줄):

```ts
  // '/api/staticmap'는 JSON-LD 대표 이미지/썸네일로 쓰여 검색 수집이 필요하므로 /api/ 차단에서 예외.
  const allow = ['/', '/apt/', '/officetel/', '/villa/', '/api/staticmap', ...(isBoardPublic() ? ['/board/'] : [])];
```

`disallow: ['/list', '/api/', '/admin']`는 건드리지 않는다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm exec vitest run tests/lib/robots.test.ts`
Expected: 두 테스트 모두 **PASS** (2 passed).

- [ ] **Step 5: robots.txt 출력에서 Allow-before-Disallow 확인**

Run: `pnpm build && cat .next/server/app/robots.txt.body 2>/dev/null || (pnpm exec next build >/dev/null 2>&1; find .next -name 'robots*' -type f)`

간이 검증(빌드 없이): serializer 규칙상 `Allow:` 줄이 항상 `Disallow:` 줄보다 먼저 출력되므로, 생성물에 다음 순서가 나오는지 눈으로 확인한다.
```
User-Agent: *
Allow: /
...
Allow: /api/staticmap
Disallow: /list
Disallow: /api/
Disallow: /admin
```
Expected: 각 룰 그룹에서 `Allow: /api/staticmap`가 `Disallow: /api/`보다 **앞줄**. (빌드가 무겁거나 CI에서만 도는 환경이면 이 단계는 배포 후 실제 `/robots.txt`로 확인해도 된다 — Step 6 커밋을 막지 않는다.)

- [ ] **Step 6: lint + 전체 유닛 테스트 게이트**

Run: `pnpm lint && pnpm test:unit`
Expected: lint 0 경고/에러, 유닛 테스트 전부 PASS (신규 `tests/lib/robots.test.ts` 포함).

- [ ] **Step 7: 커밋**

```bash
git add app/robots.ts tests/lib/robots.test.ts
git commit -m "$(cat <<'EOF'
feat(seo): robots.txt에서 /api/staticmap 수집 허용

/api/staticmap 지도 이미지는 8개 상세페이지의 JSON-LD 대표 이미지·썸네일로
쓰이는데 Disallow: /api/가 이를 막아 네이버 검색 썸네일 수집 불가 +
서치어드바이저 "robots 차단" 리포트에 2,000건 노이즈. allow에 /api/staticmap
예외 추가(longest-match로 나머지 /api/는 계속 차단). robots() 회귀 테스트 추가.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PUjVNwjugibRCwPwS8KHws
EOF
)"
```

---

## 배포 후 수동 검증 게이트 (코드 태스크 아님 — 담당자 액션)

배포 후 **네이버 서치어드바이저 → 검증 → robots.txt** 도구에서 Yeti user-agent로 아래 URL을 테스트:

```
/api/staticmap?lat=37.5&lng=127.0&w=600&h=400&level=16
```

- **"허용됨"** → 성공. 종료.
- **"차단됨"** → Yeti가 Allow 예외를 존중하지 않는 것. 스펙의 **폴백**(route를 `/api` 밖 `/staticmap`으로 이전)을 착수. 상세 절차는 `docs/superpowers/specs/2026-07-04-robots-staticmap-allow-design.md`의 "폴백" 절 참조.

---

## Self-Review

**Spec coverage:**
- 스펙 "결정: allow에 /api/staticmap 추가" → Task 1 Step 3. ✅
- 스펙 "회귀 방지 테스트 (tests/lib/robots.test.ts)" → Task 1 Step 1·4·6. ✅
- 스펙 "검증 게이트 (Yeti 실측)" → "배포 후 수동 검증 게이트" 절. ✅
- 스펙 "폴백 문서화만" → 이번 구현 대상 제외 명시 + 수동 게이트에서 트리거 조건 링크. ✅
- 스펙 "Allow-before-Disallow 확인" → Task 1 Step 5. ✅
- 스펙 "트레이드오프(NCP 크롤)" → 코드 변경 없음(수용된 사항), 계획 태스크 불필요. ✅

**Placeholder scan:** TBD/TODO 없음. 모든 코드 스텝에 실제 코드·명령·기대결과 포함. ✅

**Type consistency:** 테스트가 참조하는 `robots()` 반환 형태(`rules`, `allow`, `disallow`)는 `app/robots.ts` 실제 구조와 일치. `allow`/`disallow`가 배열이 아닐 수도 있는 타입을 `Array.isArray` 가드로 처리. ✅
