/**
 * 1회성: 게시된(PUBLISHED) board 글에서 자동 생성 서식 틀을 걷어낸다.
 * '## 핵심 요약' 불릿·'## 참고 자료' 섹션·라벨형 소제목·불필요한 굵게 강조를 제거하고
 * 사람이 쓴 글처럼 읽히게 다듬는다. 사실은 보존한다(추가·삭제 금지).
 *
 * (2026-08-24 방향 반전: 종전에는 이 스크립트가 핵심요약 골격을 '부여'했다. 같은 골격이
 *  모든 글에 반복되는 것이 애드센스 'Low value content' 판정의 신호로 지목돼 반대로 돌린다.
 *  출처·기준일은 board 상세 페이지가 DB 필드로 따로 표기하므로 본문 '## 참고 자료'는 중복이었다.)
 *
 * 기본은 status=DRAFT로 되돌려 /admin/posts 검수 큐로 보낸다(어드민이 재게시).
 * --in-place 면 게시 상태·게시일(publishedAt)을 그대로 두고 본문만 수정한다(재게시 날짜 리셋 방지).
 *
 * 실행(OPENAI_API_KEY 필요):
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/board/restructure.ts --limit 5 --dry-run
 *   pnpm dlx dotenv -e .env.local -- tsx scripts/board/restructure.ts --limit 5 --in-place
 */
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { createOpenAiClient } from '@/lib/board/generate';
import { restructureBody } from '@/lib/board/restructure';
import { runGuardrails } from '@/lib/board/guardrails';

/**
 * 서식 틀 제거가 구조까지 훼손했는지 본다. runGuardrails는 출처·금지표현·길이만 보므로 여기서 건진다.
 *
 * blocking — 자동 판정이 확실한 것만. 실측(dry-run 3편)에서 모델이 '## 핵심 요약'을 지우면서
 *   남은 소제목을 '###'로 강등한 사례가 1편 있었다. 비결정적이라 프롬프트 문구만으로는 안 막힌다.
 * warnings — 사람이 봐야 판정되는 것. 목록 소멸은 글에 따라 옳기도 하다: 청약 일정표(#1)에서는
 *   손실이지만, 제도 해설(#2)에서는 불릿 24개를 산문으로 푸는 것이 바로 의도한 결과였다.
 *   그래서 차단하지 않고 표시만 한다.
 */
function checkStructure(oldBody: string, newBody: string): { blocking: string[]; warnings: string[] } {
  const blocking: string[] = [];
  const warnings: string[] = [];
  const h2 = (t: string) => (t.match(/^## /gm) ?? []).length;
  const bullets = (t: string) => (t.match(/^[ \t]*[-*] /gm) ?? []).length;

  // '## 핵심 요약' 1개는 사라지는 게 정상 — 그 외 소제목은 h2로 남아야 한다.
  if (h2(oldBody) - 1 > 0 && h2(newBody) === 0) {
    blocking.push(`소제목이 h2로 남지 않음(원문 h2 ${h2(oldBody)}개 → 0개, ### 강등 의심)`);
  }
  if (/^## 핵심 요약/m.test(newBody)) blocking.push("'## 핵심 요약'이 그대로 남음");
  if (/^## 참고 자료/m.test(newBody)) blocking.push("'## 참고 자료'가 그대로 남음");

  if (bullets(oldBody) >= 10 && bullets(newBody) === 0) {
    warnings.push(`목록 전멸(원문 ${bullets(oldBody)}개 → 0개) — 열거형 글이면 손실이다`);
  }
  return { blocking, warnings };
}

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i === -1) return def;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : def;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const inPlace = process.argv.includes('--in-place');
  const limit = argNum('--limit', 5);
  const client = createOpenAiClient(env.OPENAI_API_KEY);

  // 아직 서식 틀이 남아 있는 게시글만(재실행 안전 — 걷어낸 글은 다음 회차에 다시 잡히지 않는다).
  //
  // ⚠️ 손수 쓴 글(detectedFrom='manual:*')은 제외한다. 조건 반전 전에는 '골격 없는 글'을 골랐으므로
  //    수기 글이 LLM 재작성 대상이 될 일이 없었지만, 반전 후에는 골격이 붙은 수기 글이 걸린다.
  //    수기 글에는 조문번호·판례번호·검산한 실측치가 들어 있고 runGuardrails는 그것들을 검사하지
  //    않는다(출처·금지표현·길이만). 사실 유실을 자동 판정할 수단이 없으므로 아예 대상에서 뺀다.
  //    detectedFrom은 nullable이라 null을 명시적으로 포함시킨다(NOT LIKE는 null 행을 떨어뜨린다).
  const posts = await prisma.post.findMany({
    where: {
      status: 'PUBLISHED',
      body: { contains: '## 핵심 요약' },
      OR: [{ detectedFrom: null }, { detectedFrom: { not: { startsWith: 'manual:' } } }],
    },
    orderBy: { publishedAt: 'asc' },
    take: limit,
  });
  logger.info({ count: posts.length, dryRun }, 'board restructure 대상');

  for (const post of posts) {
    const newBody = await restructureBody(client, post.body, env.OPENAI_MODEL, 2200);
    const guard = runGuardrails({ body: newBody, sourceName: post.sourceName, sourceUrl: post.sourceUrl });
    const struct = checkStructure(post.body, newBody);
    const ok = guard.ok && struct.blocking.length === 0;
    const charCount = newBody.replace(/\s/g, '').length;
    logger.info({ id: String(post.id), title: post.title, charCount, guardOk: ok }, 'restructured');
    const problems = [...guard.violations, ...struct.blocking];
    console.log(
      `\n[#${post.id}] ${post.title}\n${'-'.repeat(60)}\n${newBody}\n${'-'.repeat(60)}\n` +
        `검사: ${ok ? 'PASS ✅' : 'FAIL ❌ → ' + problems.join(', ')} (공백제외 ${charCount}자)` +
        (struct.warnings.length ? `\n⚠️ 사람이 볼 것: ${struct.warnings.join(', ')}` : '') +
        '\n',
    );

    if (dryRun) continue;
    if (!ok) {
      logger.warn({ id: String(post.id), violations: problems }, '검사 실패 — 건너뜀(원본 유지)');
      continue;
    }
    if (inPlace) {
      // 게시 유지: 본문만 교체. status·publishedAt 손대지 않음(게시일 보존).
      await prisma.post.update({ where: { id: post.id }, data: { body: newBody } });
      logger.info({ id: String(post.id) }, 'in-place 수정(게시·게시일 유지)');
    } else {
      await prisma.post.update({
        where: { id: post.id },
        data: { body: newBody, status: 'DRAFT', reviewedAt: null },
      });
      logger.info({ id: String(post.id) }, 'DRAFT로 되돌림 — /admin/posts에서 검수');
    }
  }
}

main()
  .catch((err) => { logger.error({ err }, 'board restructure fatal'); process.exit(1); })
  .finally(() => { void prisma.$disconnect(); });
