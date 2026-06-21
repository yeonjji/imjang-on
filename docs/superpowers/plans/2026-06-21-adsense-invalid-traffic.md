# AdSense 무효 트래픽 방어 (Approach A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AdSense 게시자 무효 트래픽 리스크를 줄이기 위해 `subscribe-soon` 폼에 허니팟을 추가하고, GA4 연동·광고 배치·운영 절차를 문서화한다.

**Architecture:** 코드 변경은 `subscribe-soon` 폼 허니팟 한 곳뿐(서버 zod optional 필드 + 클라이언트 숨김 input). 나머지는 `docs/adsense/` 문서 3종과 운영 런북. GA4는 이미 `app/layout.tsx`에 조건부 배선되어 있어 코드 변경이 없고, 환경변수 설정은 운영자가 수행한다.

**Tech Stack:** Next.js(App Router), TypeScript, Prisma, zod, Vitest 2(`globals: false`, `@/` alias), pnpm.

**Branch:** `feat/adsense-invalid-traffic-defense` (이미 체크아웃됨)

**Spec:** `docs/superpowers/specs/2026-06-21-adsense-invalid-traffic-design.md`

---

## File Structure

생성/수정할 파일과 책임:

- **Modify** `app/api/subscribe-soon/route.ts` — `Body` zod 스키마에 `company` 허니팟 optional 필드 추가, trim 후 non-empty면 저장 스킵하고 `{ ok: true }` 반환.
- **Modify** `app/(public)/_components/soon-modal.tsx` — 시각/스크린리더에서 숨긴 `company` 입력을 state로 관리하고 POST 바디에 포함.
- **Create** `tests/lib/subscribe-soon-honeypot.test.ts` — 허니팟 동작 4 케이스 단위 테스트(prisma 모킹, DB 미접속).
- **Create** `docs/adsense/invalid-traffic-monitoring.md` — 무효 트래픽 모니터링 플레이북.
- **Create** `docs/adsense/ad-placement-policy.md` — 광고 배치 정책 가이드.
- **Create** `docs/adsense/operations-runbook.md` — GA4/AdSense 연동·승인 체크리스트·무효활동 대응 런북.

---

## Task 1: `subscribe-soon` 허니팟 (TDD)

**Files:**
- Test: `tests/lib/subscribe-soon-honeypot.test.ts` (create)
- Modify: `app/api/subscribe-soon/route.ts`
- Modify: `app/(public)/_components/soon-modal.tsx`

허니팟 필드명은 `company`로 확정. 계약: 클라이언트는 숨김 `company` 입력을 비워 보내고(빈 문자열), 봇은 자동 채움. 서버는 `company`가 trim 후 비어있지 않으면 저장하지 않고 성공처럼 응답(봇에 차단 단서 미제공).

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/lib/subscribe-soon-honeypot.test.ts` 생성:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// prisma를 모킹하여 DB 없이 라우트 핸들러를 단위 테스트한다.
vi.mock('@/lib/db', () => ({
  prisma: { emailSignup: { upsert: vi.fn() } },
}));

import { prisma } from '@/lib/db';
import { POST } from '@/app/api/subscribe-soon/route';

const upsert = prisma.emailSignup.upsert as unknown as ReturnType<typeof vi.fn>;

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/subscribe-soon', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('subscribe-soon honeypot', () => {
  beforeEach(() => {
    upsert.mockReset();
    upsert.mockResolvedValue({});
  });

  it('(a) 허니팟 키 부재 → 정상 저장', async () => {
    const res = await post({ email: 'a@b.com', topic: '청약' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('(b) 허니팟 빈 문자열 → 정상 저장', async () => {
    const res = await post({ email: 'a@b.com', topic: '청약', company: '' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('(c) 허니팟 trim 후 non-empty → 저장 스킵 + ok', async () => {
    const res = await post({ email: 'a@b.com', topic: '청약', company: '  spam  ' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('(d) 잘못된 email → 400, 저장 안 함', async () => {
    const res = await post({ email: 'not-an-email', topic: '청약' });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `pnpm exec vitest run tests/lib/subscribe-soon-honeypot.test.ts`
Expected: (c) 케이스 FAIL — 현재 라우트는 허니팟을 모르므로 `company`가 채워져도 `upsert`가 호출됨(`expect(upsert).not.toHaveBeenCalled()` 실패). (a),(b),(d)는 통과할 수 있음.

- [ ] **Step 3: 라우트에 허니팟 로직 추가**

`app/api/subscribe-soon/route.ts`를 아래로 수정:

```ts
import { prisma } from '@/lib/db';
import { ApiError, apiErrorResponse } from '@/lib/api-error';
import { z } from 'zod';

const Body = z.object({
  email: z.string().email(),
  topic: z.string().min(1).max(40),
  company: z.string().optional(), // 허니팟: 실제 사용자는 비워둠, 봇은 자동 채움
});

export async function POST(req: Request) {
  try {
    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'invalid body', 400);
    // 허니팟이 채워져 있으면 봇으로 간주: 저장하지 않고 성공처럼 응답(차단 단서 미제공)
    if (parsed.data.company && parsed.data.company.trim() !== '') {
      return Response.json({ ok: true });
    }
    await prisma.emailSignup.upsert({
      where: { email: parsed.data.email },
      create: { email: parsed.data.email, topic: parsed.data.topic },
      update: { topic: parsed.data.topic },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `pnpm exec vitest run tests/lib/subscribe-soon-honeypot.test.ts`
Expected: 4개 케이스 모두 PASS.

- [ ] **Step 5: 클라이언트 폼에 숨김 허니팟 입력 추가**

`app/(public)/_components/soon-modal.tsx`를 수정한다. (1) `company` state 추가, (2) 바디에 `company` 포함, (3) 폼에 숨김 입력 추가.

`useState` 선언부에 추가:

```tsx
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // 허니팟 (실제 사용자는 비워둠)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
```

`fetch` 바디를 수정(허니팟 값을 명시적으로 포함해야 서버가 수신함):

```tsx
        body: JSON.stringify({ email, topic, company }),
```

`<form>` 안, 이메일 `<Input>` 바로 위(또는 아래)에 숨김 입력 추가:

```tsx
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}>
            <label htmlFor="company">회사명</label>
            <input
              type="text"
              id="company"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>
```

- [ ] **Step 6: 타입체크 + 린트**

Run: `pnpm typecheck && pnpm lint`
Expected: 에러 없음. (`tsc --noEmit` + `next lint` 모두 통과)

- [ ] **Step 7: 단위 스위트 회귀 확인**

Run: `pnpm test:unit`
Expected: 신규 허니팟 테스트 포함 전체 PASS(기존 테스트 무회귀).

- [ ] **Step 8: 커밋**

```bash
git add app/api/subscribe-soon/route.ts app/(public)/_components/soon-modal.tsx tests/lib/subscribe-soon-honeypot.test.ts
git commit -m "feat(subscribe-soon): 허니팟으로 봇 제출 차단

- 서버: company 허니팟 필드 추가, trim 후 non-empty면 저장 스킵
- 클라이언트: 숨김 company 입력을 state로 관리해 바디에 포함
- 테스트: 허니팟 4 케이스 (부재/빈값/채워짐/잘못된 email)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 무효 트래픽 모니터링 플레이북 문서

**Files:**
- Create: `docs/adsense/invalid-traffic-monitoring.md`

- [ ] **Step 1: 문서 생성**

`docs/adsense/invalid-traffic-monitoring.md`를 아래 내용으로 생성:

```markdown
# 무효 트래픽 모니터링 플레이북

> AdSense 게시자는 자신의 사이트 트래픽을 "성실히 모니터링"할 책임이 있다(Google 정책).
> 이 문서는 무엇을, 어디서, 얼마나 자주 보는지 정의한다.

## 도구

- **GA4** — 트래픽 출처·지역·기기·체류시간 분석. 탐색(Exploration)에서 세그먼트 사용.
- **AdSense 보고서** — URL 채널/맞춤 채널별 노출·클릭·CTR, 무효활동 보고서.

## 의심 신호 체크리스트

| 신호 | 보는 곳 | 정상 범위에서 벗어나면 |
|---|---|---|
| 특정 페이지/시간대 트래픽 급증 | GA4 실시간·획득 | 유입 소스 확인, 인위적 트래픽 의심 |
| 비정상 지역 유입(서비스 무관 국가) | GA4 인구통계·지역 | 봇/프록시 의심, AdSense 무효활동 교차확인 |
| 스팸·트래픽교환 referral | GA4 획득 > 트래픽 소스 | 해당 referral 차단·신고 검토 |
| 비정상적으로 짧은 체류 + 높은 이탈 | GA4 참여도 | 봇 트래픽 가능성 |
| direct 트래픽 폭증 | GA4 획득 | UTM 없는 대량 유입, 출처 불명 의심 |
| CTR 이상치(과도하게 높음) | AdSense 보고서 | 자기클릭·클릭유도·무효클릭 의심 |

## 점검 주기

- AdSense 승인 직후: **매일** (초기 트래픽 패턴 파악).
- 안정화 후: **주 1회**.
- 트래픽 캠페인/외부 노출 직후: 해당 기간 집중 점검.

## GA4 봇 제외의 한계

GA4 "알려진 봇·스파이더 제외"는 IAB 목록 기반으로 **자기식별 UA를 가진 봇만** 거른다.
정상 브라우저 UA를 위장한 봇·레지덴셜 프록시는 통과하므로, GA4 단독으로 판단하지 말고
**AdSense 무효활동 보고서와 반드시 교차 확인**한다.

## 이상 발견 시

`operations-runbook.md`의 "무효활동 대응" 절차를 따른다(원인 격리 → 신고 → 필요 시 이의신청).

## 참고
- 무효 트래픽 방지 방법: https://support.google.com/adsense/answer/1112983?hl=ko
- 무효 트래픽 정의: https://support.google.com/adsense/answer/16737?hl=ko
```

- [ ] **Step 2: 생성 확인**

Run: `test -f docs/adsense/invalid-traffic-monitoring.md && echo OK`
Expected: `OK`

- [ ] **Step 3: 커밋**

```bash
git add docs/adsense/invalid-traffic-monitoring.md
git commit -m "docs(adsense): 무효 트래픽 모니터링 플레이북

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 광고 배치 정책 가이드 문서

**Files:**
- Create: `docs/adsense/ad-placement-policy.md`

- [ ] **Step 1: 문서 생성**

`docs/adsense/ad-placement-policy.md`를 아래 내용으로 생성:

```markdown
# 광고 배치 정책 가이드

> AdSense 로더(`adsbygoogle.js`, `client=ca-pub-7716793757405086`)는 이미 `app/layout.tsx` head에
> 라이브이나, 실제 광고 단위(`<ins class="adsbygoogle">`)는 아직 사이트에 없다.
> **광고 단위를 삽입할 때 아래 규칙을 반드시 준수한다.** 위반은 계정 정지로 이어질 수 있다.

## DON'T (계정 해지 위험)

- ❌ 광고를 메뉴·네비게이션·버튼·다운로드 링크처럼 **착각하게 배치**(기만적 배치).
- ❌ 콘텐츠가 거의 없거나 없는 페이지·빈 페이지·로딩/에러 페이지에 광고 게재.
- ❌ "광고를 클릭하세요" 같은 **클릭 유도 문구**.
- ❌ IFRAME에 광고를 숨겨 보고 불일치 유발.
- ❌ 자동 새로고침으로 노출/클릭 인위적 증가.

## DO

- ✅ 광고를 콘텐츠와 **명확히 구분**(충분한 여백 + "광고/Sponsored" 라벨 권장).
- ✅ 모바일에서 인터랙티브 요소(버튼·링크)와 떨어뜨려 **우발적 터치 방지**.
- ✅ 실질 콘텐츠가 있는 페이지에만 게재.
- ✅ 여러 브라우저·기기에서 정상 렌더·클릭 동작 테스트.

## 구현 시 (승인 후 별도 작업)

향후 광고 단위는 이 가이드를 강제하는 **재사용 `<AdSlot>` 컴포넌트 1개**로 표준화한다
(라벨·여백·레이아웃을 컴포넌트에 내장). 본 작업 범위 밖.

## 참고
- 애드센스 프로그램 정책: https://support.google.com/adsense/answer/48182?hl=ko
- 계정 해지로 이어지는 주요 위반: https://support.google.com/adsense/answer/2660562?hl=ko
```

- [ ] **Step 2: 생성 확인**

Run: `test -f docs/adsense/ad-placement-policy.md && echo OK`
Expected: `OK`

- [ ] **Step 3: 커밋**

```bash
git add docs/adsense/ad-placement-policy.md
git commit -m "docs(adsense): 광고 배치 정책 가이드

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 운영 런북 문서 (GA4/AdSense 연동 + 승인 체크리스트 + 대응)

**Files:**
- Create: `docs/adsense/operations-runbook.md`

- [ ] **Step 1: 문서 생성**

`docs/adsense/operations-runbook.md`를 아래 내용으로 생성:

```markdown
# AdSense 운영 런북

## 1. GA4 연동 (운영자 수행)

코드는 이미 준비됨 — `app/layout.tsx`가 `NEXT_PUBLIC_GA_ID`가 있으면 `<GoogleAnalytics>`를 렌더한다.

1. [ ] GA4 속성 생성 → Measurement ID(`G-…`) 발급.
2. [ ] `.env.local`에 `NEXT_PUBLIC_GA_ID` **추가**(키가 없으면 신규 추가) + Vercel 환경변수에도 동일 키 설정.
3. [ ] 배포 후 GA4 **실시간 보고서**에서 페이지뷰 수집 확인.
4. [ ] GA4 데이터 설정 → "알려진 봇·스파이더 제외"(기본 on) 확인.
5. [ ] GA4 내부 트래픽 필터로 **운영자 자기 IP 제외**(자기 방문이 무효 신호를 오염시키지 않도록).
6. [ ] AdSense 콘솔에서 **GA4 속성 링크** → 페이지별 수익·노출·유입 출처 교차 분석.

## 2. 무효 트래픽 절대 금지 (계정 정지 직결)

- ❌ 자신의 광고 클릭 — 관심 있거나 URL 확인 목적이라도 금지.
- ❌ 가족·지인·방문자에게 클릭 요청·유도.
- ❌ 구매·교환·인센티브 트래픽(클릭 교환, 자동 서핑 등) 유입.
- ❌ 봇/자동화 수단으로 노출·클릭 인위적 증가.

## 3. 승인 전 체크리스트

각 항목을 현재 사이트 상태로 점검하고 PASS/FAIL 표시:

- [ ] 오리지널·실질 콘텐츠 충분.
- [ ] 개인정보처리방침 페이지 존재 — `/privacy` (PASS)
- [ ] 이용약관 페이지 존재 — `/terms` (PASS)
- [ ] 문의 경로 존재 — `/contact` (PASS)
- [ ] 명확한 네비게이션/사이트 구조.
- [ ] 광고 단위 삽입 시 `ad-placement-policy.md` 준수.

## 4. 무효활동 대응 (모니터링에서 이상 발견 시)

1. `invalid-traffic-monitoring.md`의 신호로 이상 확인(GA4 + AdSense 교차).
2. 원인 격리 — 유입 소스/페이지/기간 특정.
3. 제3자 무효활동(경쟁자 클릭폭격 등) 의심 시 Google **무효 클릭/트래픽 신고 채널**로 신고.
4. 계정 경고·정지 시 — AdSense 무효활동 보고서 확인 → 원인 제거 → **이의신청** 절차.

## 참고
- 무효 트래픽 방지 방법: https://support.google.com/adsense/answer/1112983?hl=ko
- 계정 해지로 이어지는 주요 위반: https://support.google.com/adsense/answer/2660562?hl=ko
- Google의 무효 트래픽 방지: https://support.google.com/adsense/answer/1348752?hl=ko
```

- [ ] **Step 2: 생성 확인 + 승인 체크리스트 PASS 항목 검증**

Run: `test -f docs/adsense/operations-runbook.md && echo OK`
Expected: `OK`

Run(체크리스트의 PASS 주장 근거 확인): `ls app/\(public\)/privacy/page.tsx app/\(public\)/terms/page.tsx app/\(public\)/contact/page.tsx`
Expected: 세 파일 모두 존재(승인 전 체크리스트의 PASS 표시가 사실임을 확인).

- [ ] **Step 3: 커밋**

```bash
git add docs/adsense/operations-runbook.md
git commit -m "docs(adsense): 운영 런북 (GA4 연동·승인 체크리스트·무효활동 대응)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 완료 기준 (전체)

- [ ] Task 1: `pnpm test:unit` 통과(허니팟 4 케이스 포함), `pnpm typecheck && pnpm lint` 통과.
- [ ] Task 2–4: `docs/adsense/` 3개 문서 존재, 런북 승인 체크리스트의 PASS 항목이 실제 파일로 뒷받침됨.
- [ ] 운영(코드 외, 사용자 수행): GA4 속성 생성·`NEXT_PUBLIC_GA_ID` 설정·AdSense 링크·내부 IP 필터 — 런북 §1 참조.

---

## Self-Review (작성자 점검 완료)

**Spec coverage:**
- 성공기준 A(허니팟 자동 테스트 4종) → Task 1. ✅
- 성공기준 B2/B3(GA4 수집·AdSense 링크, 운영) → Task 4 §1(런북 절차). ✅
- 성공기준 B4(문서 3종 + 승인 체크리스트 PASS) → Task 2,3,4 + Task4 Step2 검증. ✅
- §4.1 GA4 연동/한계 → Task 4 §1 + Task 2 봇 제외 한계. ✅
- §4.2 모니터링 → Task 2. ✅
- §4.3 광고 배치(로더 라이브/ins 미배치, 정책 출처) → Task 3. ✅
- §4.4 허니팟 계약(필드 company, 클라 바디 포함, 서버 trim, robots 변경 없음) → Task 1. robots는 변경 없음이므로 태스크 없음(스펙과 일치). ✅
- §4.5 운영 런북 → Task 4. ✅

**Placeholder scan:** 모든 코드/문서 단계에 실제 내용 포함, TODO/TBD 없음. ✅

**Type consistency:** 허니팟 필드명 `company`가 서버 zod·클라 state·바디·테스트 전반에서 일치. `prisma.emailSignup.upsert` 시그니처가 기존 코드와 동일. ✅
