/**
 * 1회성: 게시된 board 글 3편의 공개 오류를 원천(DB)에서 바로잡는다.
 *
 * 이 글들의 본문은 저장소가 아니라 DB에만 있다(자동 생성·admin 게시 경로). 그래서 코드 수정만으로는
 * 화면이 고쳐지지 않아 별도 보정 스크립트를 둔다. 치환은 문자열 완전 일치이고, 이미 적용된 글은
 * 건너뛴다(멱등). 치환 후 `content-audit`으로 재검사해 지적이 남으면 쓰지 않는다.
 *
 * 실행:
 *   pnpm exec dotenv -e .env.local -- tsx scripts/board/fix-published-content.ts          # dry-run
 *   pnpm exec dotenv -e .env.…    -- tsx scripts/board/fix-published-content.ts --apply
 */
import { prisma } from '@/lib/db';
import { auditLinks, auditUnitSums } from '@/lib/board/content-audit';

/** SH 인터넷청약시스템. 공고문에 적힌 주소(www.i-sh.co.kr/app)의 실제 진입 URL. */
const SH_APPLY_URL = 'https://www.i-sh.co.kr/app/index.do';

interface Replacement {
  field: 'body' | 'summary';
  from: string;
  to: string;
}

interface Fix {
  dedupeKey: string;
  /** 안전장치: 대상 글이 맞는지 제목으로 한 번 더 확인한다. */
  expectTitleIncludes: string;
  why: string;
  replacements: Replacement[];
}

const FIXES: Fix[] = [
  {
    dedupeKey: 'fp:subscription:2026-08-14',
    expectTitleIncludes: '2026년 8월 하반기 전국 청약',
    // 개별 12건의 세대 수는 SubscriptionNotice 실측과 모두 일치한다(검증: 2026-09-04, 운영 DB 읽기전용).
    // 유형별 합계 APT 2,826 / ARBITRARY 42 / REMNANT 2, 전체 2,870. 본문의 2,822·2,748만 틀렸다.
    why: '유형별·전체 세대 합계가 개별 값의 합과 어긋남 (아파트 2,822→2,826, 전체 2,748→2,870)',
    replacements: [
      { field: 'body', from: '총 2,822세대를 공급한다', to: '총 2,826세대를 공급한다' },
      { field: 'body', from: '합산하면 2,748세대로', to: '합산하면 2,870세대로' },
      { field: 'summary', from: '총 2,748세대가 공급된다', to: '총 2,870세대가 공급된다' },
    ],
  },
  {
    dedupeKey: 'manual:sh-happy-housing-2026-2',
    expectTitleIncludes: 'SH 행복주택',
    why: 'GFM 자동 링크가 조사를 삼켜 http://www.i-sh.co.kr/app)에서 로 깨짐',
    replacements: [
      {
        field: 'body',
        from: '(www.i-sh.co.kr/app)',
        to: `([www.i-sh.co.kr/app](${SH_APPLY_URL}))`,
      },
    ],
  },
  {
    dedupeKey: 'manual:sh-jangi-jeonse-51',
    expectTitleIncludes: 'SH 장기전세',
    why: 'GFM 자동 링크가 조사를 삼켜 http://www.i-sh.co.kr/app)에서 로 깨짐',
    replacements: [
      {
        field: 'body',
        from: '(www.i-sh.co.kr/app)',
        to: `([www.i-sh.co.kr/app](${SH_APPLY_URL}))`,
      },
    ],
  },
  {
    dedupeKey: 'manual:청년미래적금:2026-06-24',
    expectTitleIncludes: '청년미래적금',
    // 링크가 두 겹으로 깨져 있었다. 자동 링크가 `)에서`를 삼킨 데다, 대상 경로 `/yfs/`
    // 자체가 404다(실측 2026-09-04). 호스트 루트는 200이고 「서민금융진흥원 | 청년미래적금
    // 상품 안내」로 확인돼 그 주소로 바꾼다. 꺾쇠(<url>)는 조사를 삼키지 않는다.
    why: '자동 링크 깨짐 + 대상 경로 /yfs/ 가 404 → 검증된 호스트 루트로 교정',
    replacements: [
      {
        field: 'body',
        from: '누리집(https://fill4young.kinfa.or.kr/yfs/)에서',
        to: '누리집(<https://fill4young.kinfa.or.kr/>)에서',
      },
    ],
  },
  {
    dedupeKey: 'manual:맞춤형재무상담:2026-07-07',
    expectTitleIncludes: '맞춤형 재무상담',
    // 단축 URL 자체는 살아 있다(200 → form.naver.com). 자동 링크만 깨져 있어 그것만 고친다.
    why: 'GFM 자동 링크가 조사를 삼켜 https://naver.me/5ssJwaLv)에서 로 깨짐',
    replacements: [
      {
        field: 'body',
        from: '네이버 폼(https://naver.me/5ssJwaLv)에서',
        to: '네이버 폼(<https://naver.me/5ssJwaLv>)에서',
      },
    ],
  },
];

function apply(text: string, from: string, to: string): { text: string; count: number } {
  const count = text.split(from).length - 1;
  return { text: count ? text.split(from).join(to) : text, count };
}

async function main() {
  const write = process.argv.includes('--apply');
  console.log(write ? '=== APPLY ===' : '=== DRY RUN (쓰지 않음. --apply로 반영) ===');

  const changedPaths: string[] = [];

  for (const fix of FIXES) {
    const post = await prisma.post.findUnique({
      where: { dedupeKey: fix.dedupeKey },
      select: { id: true, title: true, status: true, body: true, summary: true },
    });
    if (!post) {
      console.log(`\n[skip] ${fix.dedupeKey} — 글 없음`);
      continue;
    }
    if (!post.title.includes(fix.expectTitleIncludes)) {
      console.log(`\n[skip] /board/${post.id} — 제목이 예상과 다름: ${post.title}`);
      continue;
    }

    console.log(`\n/board/${post.id} (${post.status}) — ${post.title}`);
    console.log(`  사유: ${fix.why}`);

    const next = { body: post.body, summary: post.summary };
    let hits = 0;
    for (const r of fix.replacements) {
      const res = apply(next[r.field], r.from, r.to);
      next[r.field] = res.text;
      hits += res.count;
      console.log(
        res.count
          ? `  ✎ ${r.field}: "${r.from}" → "${r.to}" (${res.count}곳)`
          : `  · ${r.field}: "${r.from}" 없음 — 이미 반영됐거나 본문이 바뀜`,
      );
    }
    if (hits === 0) {
      console.log('  변경 없음 — 건너뜀');
      continue;
    }

    // 고친 결과가 실제로 깨끗한지 확인한 뒤에만 쓴다.
    const remaining = [
      ...auditLinks(next.body).map((f) => `링크(${f.issue}) ${f.href}`),
      ...auditUnitSums(next.body).map((f) => `합계(${f.kind}) ${f.stated}≠${f.expected}`),
    ];
    if (remaining.length) {
      console.log(`  ✗ 수정 후에도 지적이 남아 쓰지 않는다:\n    ${remaining.join('\n    ')}`);
      process.exitCode = 1;
      continue;
    }
    console.log('  ✓ 수정본 재검사 통과');

    if (write) {
      await prisma.post.update({
        where: { id: post.id },
        data: { body: next.body, summary: next.summary, reviewedAt: new Date() },
      });
      console.log('  → 저장 완료');
    }
    changedPaths.push(`/board/${post.id}`);
  }

  if (changedPaths.length) {
    console.log(
      `\n${write ? '반영' : '반영 예정'}: ${changedPaths.join(', ')}` +
        `\nISR 캐시 무효화가 필요하다: /board 와 위 경로를 /api/revalidate로 재검증할 것.`,
    );
  } else {
    console.log('\n반영할 변경 없음.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
