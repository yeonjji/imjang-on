# 법적 안내 페이지 정비 + 사이트맵 + 애드센스 대응 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 구현된 기능 범위에 맞춰 안내·법적 페이지(서비스 소개·이용약관·개인정보 처리방침)를 정식 문서로 정비하고, 문의·사용자용 사이트맵 페이지와 ads.txt를 추가하여 Google AdSense 승인 요건을 충족한다.

**Architecture:** 모든 페이지는 Next.js App Router 서버 컴포넌트 + 정적 렌더 + `export const metadata`(canonical). 기존 디자인 토큰(`var(--color-*)`)과 정적 페이지 패턴(`article.mx-auto.max-w-2xl.px-6.py-16`)을 따른다. 기존 `app/sitemap.ts`는 재작성하지 않고 `STATIC_ENTRIES`에 라우트만 append. 새 의존성·DB·환경변수 없음.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Tailwind(CSS 변수 토큰), pnpm.

---

## File Structure

- 재작성: `app/(public)/about/page.tsx`, `app/(public)/terms/page.tsx`, `app/(public)/privacy/page.tsx`
- 신규: `app/(public)/contact/page.tsx`, `app/(public)/sitemap/page.tsx`, `public/ads.txt`
- 외과적 수정: `app/sitemap.ts`(STATIC_ENTRIES append), `app/(public)/_components/footer.tsx`(링크 추가)
- 유지(변경 없음): `app/(public)/data-source/page.tsx`, `app/robots.ts`

검증은 타입체크·빌드 중심. 이 작업은 정적 콘텐츠 페이지라 단위 테스트 대신 `pnpm typecheck` + `pnpm build` + 라우트 응답 확인으로 검증한다(기존 코드베이스에 정적 페이지용 테스트 관례 없음).

---

### Task 1: `/about` 서비스 소개 재작성

**Files:**
- Modify: `app/(public)/about/page.tsx` (전체 교체)

- [ ] **Step 1: 페이지 전체 교체**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '서비스 소개', alternates: { canonical: '/about' } };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">임장온 소개</h1>

      <p className="mt-5 text-[var(--color-text)]">
        임장온은 국토교통부 실거래가, 한국부동산원 청약홈, 건강보험심사평가원, 교육부, 보건복지부,
        행정안전부, 국가철도공단 등 공공데이터를 가공·통합해 제공하는 비상업 부동산 정보 플랫폼입니다.
      </p>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">제공하는 정보</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[var(--color-text)]">
        <li>아파트·오피스텔·연립다세대 실거래가(매매·전세·월세)</li>
        <li>청약·분양 일정 정보</li>
        <li>생활 인프라 — 학교·어린이집, 병원·약국, 편의점·마트·카페·전통시장, 공원·주차장·전기차 충전소</li>
        <li>지하철 역세권 및 지역별 시세</li>
      </ul>

      <h2 className="mt-10 text-xl font-bold text-[var(--color-text)]">운영 안내</h2>
      <p className="mt-3 text-[var(--color-text)]">
        임장온은 개인이 운영하는 비상업 정보 서비스이며, 회원가입·결제·중개 기능을 제공하지 않습니다.
        문의는{' '}
        <a href="mailto:contact@imjang-on.com" className="underline hover:text-[var(--color-blue-dark)]">
          contact@imjang-on.com
        </a>
        으로 받습니다.
      </p>

      <p className="mt-8 text-sm text-[var(--color-muted)]">
        본 서비스의 정보는 공공데이터를 가공해 제공하며, 실거래 신고 지연 등으로 최신성·정확성을 100%
        보장하지 않습니다. 자세한 내용은{' '}
        <Link href="/data-source" className="underline">데이터 안내</Link>,{' '}
        <Link href="/terms" className="underline">이용약관</Link>,{' '}
        <Link href="/privacy" className="underline">개인정보 처리방침</Link>,{' '}
        <Link href="/contact" className="underline">문의</Link>를 확인하세요.
      </p>
    </article>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS)

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/about/page.tsx
git commit -m "feat(about): 서비스 소개 페이지 현재 기능 기준 재작성"
```

---

### Task 2: `/terms` 이용약관 정식 재작성

**Files:**
- Modify: `app/(public)/terms/page.tsx` (전체 교체)

- [ ] **Step 1: 페이지 전체 교체**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '이용약관', alternates: { canonical: '/terms' } };

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: '제1조 (목적)',
    body: [
      '본 약관은 임장온(이하 "서비스")이 제공하는 공공데이터 기반 부동산 정보의 이용과 관련하여 서비스와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.',
    ],
  },
  {
    heading: '제2조 (정의)',
    body: [
      '① "서비스"란 임장온이 공공데이터를 가공해 제공하는 모든 정보 및 기능을 말합니다.',
      '② "이용자"란 본 약관에 따라 서비스를 이용하는 자를 말합니다.',
      '③ "콘텐츠"란 서비스가 제공하는 실거래가·청약·생활 인프라 등 일체의 정보를 말합니다.',
    ],
  },
  {
    heading: '제3조 (서비스의 내용)',
    body: [
      '① 서비스는 국토교통부 실거래가, 한국부동산원 청약홈 등 공공데이터를 가공한 정보를 제공합니다.',
      '② 서비스는 회원가입·결제·부동산 중개 행위를 제공하지 않는 정보 제공 플랫폼입니다.',
    ],
  },
  {
    heading: '제4조 (정보의 정확성 및 면책)',
    body: [
      '① 콘텐츠는 공공데이터를 가공해 제공하며, 실거래 신고 지연(통상 30일 이내) 등으로 최신성·정확성을 보장하지 않습니다.',
      '② 이용자가 콘텐츠를 활용한 부동산 거래·청약 등 의사결정의 결과에 대해 서비스는 책임지지 않습니다.',
      '③ 이용자는 실제 거래·이용 전 반드시 원 출처 및 관계 기관을 통해 정보를 확인해야 합니다.',
    ],
  },
  {
    heading: '제5조 (지식재산권 및 출처표시)',
    body: [
      '① 서비스는 공공누리 제1유형(출처표시)에 따라 공공데이터를 이용합니다.',
      '② 각 데이터의 원저작권은 해당 제공기관에 있으며, 출처는 데이터 안내 페이지에 표기합니다.',
    ],
  },
  {
    heading: '제6조 (광고의 게재)',
    body: [
      '① 서비스는 Google AdSense 등 제3자 광고를 게재할 수 있습니다.',
      '② 광고주와의 거래에 관한 책임은 이용자와 광고주 간에 있으며, 서비스는 이에 관여하지 않습니다.',
    ],
  },
  {
    heading: '제7조 (약관의 변경)',
    body: [
      '서비스는 필요 시 본 약관을 변경할 수 있으며, 변경된 약관은 본 페이지에 게시함으로써 효력이 발생합니다.',
    ],
  },
  {
    heading: '제8조 (준거법 및 관할)',
    body: [
      '본 약관은 대한민국 법령에 따라 해석되며, 분쟁은 관계 법령이 정한 절차에 따릅니다.',
    ],
  },
];

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">이용약관</h1>
      <p className="mt-3 text-sm text-[var(--color-muted)]">시행일: 2026년 6월 7일</p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-[var(--color-text)]">{p}</p>
            ))}
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-[var(--color-muted)]">
        문의: <a href="mailto:contact@imjang-on.com" className="underline">contact@imjang-on.com</a>
      </p>
    </article>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS)

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/terms/page.tsx
git commit -m "feat(terms): 이용약관 정식 문서로 재작성"
```

---

### Task 3: `/privacy` 개인정보 처리방침 정식 재작성 (AdSense 핵심)

**Files:**
- Modify: `app/(public)/privacy/page.tsx` (전체 교체)

- [ ] **Step 1: 페이지 전체 교체**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '개인정보 처리방침', alternates: { canonical: '/privacy' } };

const SECTIONS: { heading: string; body: React.ReactNode[] }[] = [
  {
    heading: '1. 수집하는 개인정보 항목',
    body: [
      '① 출시·청약 알림 신청 시: 이메일 주소',
      '② 자동 수집 항목: 쿠키, 접속 IP, 브라우저 및 기기 정보(서비스 이용 통계 및 광고 게재 목적)',
    ],
  },
  {
    heading: '2. 개인정보의 수집·이용 목적',
    body: ['알림 발송, 서비스 이용 통계 분석, 광고 게재'],
  },
  {
    heading: '3. 보유 및 이용 기간',
    body: [
      '알림 목적 달성 또는 이용자의 수신 철회 시까지 보유하며, 관계 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.',
    ],
  },
  {
    heading: '4. 개인정보의 제3자 제공 및 처리위탁',
    body: [
      '서비스는 다음의 외부 서비스를 통해 분석·광고·호스팅을 수행합니다.',
      '· Google LLC — Google Analytics(이용 통계), Google AdSense(광고 게재)',
      '· Vercel Inc. — 트래픽 분석 및 호스팅',
    ],
  },
  {
    heading: '5. 쿠키 및 광고(Google AdSense) 안내',
    body: [
      '① 제3자(Google 포함)는 쿠키 및 웹비콘을 사용하여 이용자의 방문 정보를 수집하고 광고를 게재할 수 있습니다.',
      '② Google은 광고 쿠키를 사용하여 이용자의 본 사이트 및 다른 사이트 방문 기록을 기반으로 맞춤형 광고를 제공합니다.',
      <>
        ③ 이용자는{' '}
        <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" className="underline">
          Google 광고 설정
        </a>
        에서 맞춤형 광고를 비활성화할 수 있습니다. 제3자 광고 쿠키에 대한 자세한 내용은{' '}
        <a href="https://www.google.com/policies/technologies/ads/" target="_blank" rel="noopener noreferrer" className="underline">
          Google 광고 기술 안내
        </a>
        를 참고하세요.
      </>,
      '④ 이용자는 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 일부 기능 이용에 제한이 있을 수 있습니다.',
    ],
  },
  {
    heading: '6. 정보주체의 권리',
    body: [
      '이용자는 본인의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있으며, 요청은 아래 연락처로 접수합니다.',
    ],
  },
  {
    heading: '7. 개인정보 보호책임자',
    body: [
      <>
        임장온 운영자 / 연락처:{' '}
        <a href="mailto:contact@imjang-on.com" className="underline">contact@imjang-on.com</a>
      </>,
    ],
  },
  {
    heading: '8. 고지의 의무',
    body: ['본 개인정보 처리방침의 내용 변경 시 본 페이지를 통해 고지합니다.'],
  },
];

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">개인정보 처리방침</h1>
      <p className="mt-3 text-sm text-[var(--color-muted)]">시행일: 2026년 6월 7일</p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{s.heading}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="mt-2 text-[var(--color-text)]">{p}</p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS). `React.ReactNode[]` 배열에 문자열과 JSX가 섞여도 통과.

- [ ] **Step 3: AdSense 필수 문구 확인**

Run: `grep -n "google.com/settings/ads" app/\(public\)/privacy/page.tsx`
Expected: 1개 이상 매치 (옵트아웃 링크 포함됨)

- [ ] **Step 4: 커밋**

```bash
git add app/\(public\)/privacy/page.tsx
git commit -m "feat(privacy): 개인정보 처리방침 정식 재작성 + AdSense 광고 쿠키 고지"
```

---

### Task 4: `/contact` 문의 페이지 신규

**Files:**
- Create: `app/(public)/contact/page.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '문의', alternates: { canonical: '/contact' } };

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">문의</h1>

      <p className="mt-5 text-[var(--color-text)]">
        서비스 이용, 데이터 정정·삭제 요청, 제휴 등 모든 문의는 아래 이메일로 보내주세요.
      </p>

      <p className="mt-4 text-lg font-bold text-[var(--color-text)]">
        <a href="mailto:contact@imjang-on.com" className="underline hover:text-[var(--color-blue-dark)]">
          contact@imjang-on.com
        </a>
      </p>

      <p className="mt-6 text-sm text-[var(--color-muted)]">
        데이터의 오류·정정 요청 시 해당 화면 주소와 내용을 함께 적어주시면 빠르게 확인할 수 있습니다.
        접수된 문의는 순차적으로 답변드립니다.
      </p>
    </article>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS)

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/contact/page.tsx
git commit -m "feat(contact): 문의 페이지 신규 추가"
```

---

### Task 5: `/sitemap` 사용자용 사이트맵 페이지 신규

**Files:**
- Create: `app/(public)/sitemap/page.tsx`

참고: `LIFE_GROUPS`는 `app/(public)/_components/life-menu.ts`에서 export됨. 각 group은 `{ slug, label, intro, items: { label, href, live }[] }` 구조. live가 true인 항목만 링크로 노출한다.

- [ ] **Step 1: 파일 생성**

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { LIFE_GROUPS } from '../_components/life-menu';

export const metadata: Metadata = { title: '사이트맵', alternates: { canonical: '/sitemap' } };

const PRIMARY: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: '실거래가',
    links: [
      { href: '/', label: '홈' },
      { href: '/list', label: '통합 실거래가' },
      { href: '/apt', label: '아파트' },
      { href: '/officetel', label: '오피스텔' },
      { href: '/villa', label: '연립·다세대' },
      { href: '/region', label: '지역별 시세' },
    ],
  },
  {
    heading: '청약',
    links: [{ href: '/subscription', label: '청약·분양 일정' }],
  },
  {
    heading: '안내',
    links: [
      { href: '/about', label: '서비스 소개' },
      { href: '/data-source', label: '데이터 안내' },
      { href: '/terms', label: '이용약관' },
      { href: '/privacy', label: '개인정보 처리방침' },
      { href: '/contact', label: '문의' },
    ],
  },
];

export default function SitemapPage() {
  return (
    <article className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)]">사이트맵</h1>

      <div className="mt-8 space-y-8">
        {PRIMARY.map((group) => (
          <section key={group.heading}>
            <h2 className="text-lg font-bold text-[var(--color-text)]">{group.heading}</h2>
            <ul className="mt-3 space-y-2">
              {group.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="underline hover:text-[var(--color-blue-dark)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h2 className="text-lg font-bold text-[var(--color-text)]">생활편의</h2>
          <div className="mt-3 space-y-4">
            {LIFE_GROUPS.map((g) => (
              <div key={g.slug}>
                <Link href={`/life/${g.slug}`} className="font-semibold underline hover:text-[var(--color-blue-dark)]">
                  {g.label}
                </Link>
                <ul className="mt-2 space-y-2 pl-4">
                  {g.items
                    .filter((item) => item.live)
                    .map((item) => (
                      <li key={item.href}>
                        <Link href={item.href} className="underline hover:text-[var(--color-blue-dark)]">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS). `LIFE_GROUPS` import 경로(`../_components/life-menu`)가 해석되는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/sitemap/page.tsx
git commit -m "feat(sitemap): 사용자용 사이트맵 페이지 신규 추가"
```

---

### Task 6: `public/ads.txt` 신규 (애드센스 셀러 인증 자리)

**Files:**
- Create: `public/ads.txt`

- [ ] **Step 1: 파일 생성**

내용 (게시자 ID 발급 전이므로 주석 처리):

```
# Google AdSense 승인 후 아래 줄의 주석(#)을 제거하고 게시자 ID(pub-XXXXXXXXXXXXXXXX)를 채운다.
# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
```

- [ ] **Step 2: 접근 경로 확인 (빌드/실행 시 `/ads.txt`로 서빙됨)**

Run: `cat public/ads.txt`
Expected: 위 두 줄 출력

- [ ] **Step 3: 커밋**

```bash
git add public/ads.txt
git commit -m "chore(ads): AdSense ads.txt placeholder 추가"
```

---

### Task 7: `app/sitemap.ts` STATIC_ENTRIES에 신규 라우트 추가

**Files:**
- Modify: `app/sitemap.ts:11-32` (STATIC_ENTRIES 배열에 항목 append — 기존 동적 로직은 손대지 않음)

- [ ] **Step 1: `/subscription`과 법적/안내 라우트 추가**

`STATIC_ENTRIES` 배열의 마지막 항목(`{ url: \`${SITE}/urban/parking?sido=...\`, ... }`) 다음, 닫는 `];` 직전에 아래를 추가:

```ts
  { url: `${SITE}/subscription`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE}/about`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE}/data-source`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE}/terms`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE}/privacy`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE}/contact`, changeFrequency: 'monthly', priority: 0.3 },
  { url: `${SITE}/sitemap`, changeFrequency: 'monthly', priority: 0.3 },
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS). `changeFrequency` 리터럴이 `MetadataRoute.Sitemap` 타입과 호환.

- [ ] **Step 3: 커밋**

```bash
git add app/sitemap.ts
git commit -m "feat(sitemap): XML 사이트맵에 청약·법적 안내 라우트 추가"
```

---

### Task 8: 푸터에 문의·사이트맵 링크 추가

**Files:**
- Modify: `app/(public)/_components/footer.tsx`

- [ ] **Step 1: "법적 안내" 컬럼에 문의 링크 추가**

`app/(public)/_components/footer.tsx`의 "법적 안내" `<ul>` 안에서 개인정보 처리방침 `<li>` 다음에 추가:

기존:
```tsx
            <li><Link href="/privacy">개인정보 처리방침</Link></li>
          </ul>
```
변경 후:
```tsx
            <li><Link href="/privacy">개인정보 처리방침</Link></li>
            <li><Link href="/contact">문의</Link></li>
            <li><Link href="/sitemap">사이트맵</Link></li>
          </ul>
```

- [ ] **Step 2: 타입체크**

Run: `pnpm typecheck`
Expected: 에러 없음 (PASS)

- [ ] **Step 3: 커밋**

```bash
git add app/\(public\)/_components/footer.tsx
git commit -m "feat(footer): 문의·사이트맵 링크 추가"
```

---

### Task 9: 빌드 검증 + 라우트 응답 확인

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 프로덕션 빌드**

Run: `pnpm build`
Expected: 빌드 성공. 새 라우트 `/about`, `/terms`, `/privacy`, `/contact`, `/sitemap`이 라우트 목록에 표시되고 `/sitemap.xml`, `/robots.txt` 생성 확인.

- [ ] **Step 2: 로컬 실행 후 라우트 200 확인**

Run (백그라운드로 dev 서버 기동 후):
```bash
pnpm dev &
sleep 8
for p in /about /terms /privacy /contact /sitemap /ads.txt /sitemap.xml /robots.txt; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000$p"
done
```
Expected: 모든 경로 `200`. (확인 후 dev 서버 종료)

- [ ] **Step 3: 사이트맵 XML에 신규 라우트 포함 확인**

Run: `curl -s http://localhost:3000/sitemap.xml | grep -o '/subscription\|/privacy\|/terms\|/contact'`
Expected: 해당 경로들이 출력됨

- [ ] **Step 4: 최종 정리 커밋 (필요 시)**

빌드 산출물 외 변경이 없으면 커밋 불필요. lockfile 등 의도치 않은 변경이 생기면 되돌린다.

---

## 검증 기준 (스펙 §7 대응)
1. `pnpm typecheck` 통과 — 각 Task 단계에 포함.
2. `pnpm build` 통과 — Task 9.
3. 신규/재작성 페이지 200 응답, footer 링크 연결 — Task 8, Task 9.
4. `/privacy`에 AdSense 옵트아웃 문구 포함 — Task 3 Step 3.
5. `/sitemap.xml`에 신규 라우트 포함 + `/sitemap` 페이지 렌더 — Task 7, Task 9.
6. `/ads.txt` 접근 가능 — Task 6, Task 9.
