import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { notify } from '@/scripts/ingest/notify';
import { BOARD_FEEDS } from '@/lib/board/feed-registry';
import { fetchFeed } from './rss';
import { isRelevant, categoryHint, MIN_SOURCE_CHARS } from './relevance';
import { naverNewsCount } from './detect-issues';
import { dedupeKey, kstDateISO } from './keys';
import { collectSubscriptionCandidates } from './sources/subscription';
import { collectNaverNewsCandidates } from './sources/naver-news';
import { dropStale } from './freshness';
import type { BoardCandidate } from './candidate';
import { generateDraft, createOpenAiClient } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';

const RANK_LIMIT = 10; // 네이버 화제성 점수를 매길 후보 상한(API 호출 절약)

/** 보도자료 RSS 후보 수집(부처/키워드/길이 필터 적용). */
async function collectFeedCandidates(): Promise<{ candidates: BoardCandidate[]; feedErrors: number }> {
  const all: BoardCandidate[] = [];
  let feedErrors = 0;
  for (const feed of BOARD_FEEDS) {
    try {
      const items = await fetchFeed(feed.rssUrl);
      let kept = 0;
      for (const it of items) {
        const agency = it.agency ?? feed.defaultAgency;
        if (!it.link || !agency) continue;
        // 주제 적합 ∧ 생성 가능한 최소 본문 길이(짧으면 가드레일 reject → 사전 제외)
        if (!isRelevant({ agency, title: it.title, bodyText: it.bodyText })) continue;
        if (it.bodyText.length < MIN_SOURCE_CHARS) continue;
        all.push({
          sourceKey: feed.key,
          agency,
          title: it.title,
          link: it.link,
          pubDate: it.pubDate,
          bodyText: it.bodyText,
          dedupeKey: dedupeKey(it.link),
        });
        kept++;
      }
      logger.info({ feed: feed.key, fetched: items.length, relevant: kept }, 'feed fetched');
    } catch (err) {
      feedErrors++;
      logger.error({ err, feed: feed.key }, 'feed fetch failed');
    }
  }
  return { candidates: all, feedErrors };
}

/** 이미 생성된(dedupeKey 존재) 후보 제거 — OpenAI 호출 전 차단. */
async function dropExisting(cands: BoardCandidate[]): Promise<BoardCandidate[]> {
  if (!cands.length) return [];
  const existing = await prisma.post.findMany({
    where: { dedupeKey: { in: cands.map((c) => c.dedupeKey) } },
    select: { dedupeKey: true },
  });
  const seen = new Set(existing.map((e) => e.dedupeKey));
  return cands.filter((c) => !seen.has(c.dedupeKey));
}

/** 네이버 화제성 점수로 랭킹. 전부 null(자격증명 없음/실패)이면 최신순 폴백. */
async function rank(cands: BoardCandidate[]): Promise<BoardCandidate[]> {
  const byRecency = [...cands].sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0));
  const pool = byRecency.slice(0, RANK_LIMIT);
  const scored = await Promise.all(pool.map(async (c) => ({ c, score: await naverNewsCount(c.title) })));
  if (!scored.some((s) => s.score != null)) return byRecency;
  const rankedPool = scored
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.c.pubDate?.getTime() ?? 0) - (a.c.pubDate?.getTime() ?? 0))
    .map((s) => s.c);
  const poolSet = new Set(pool);
  return [...rankedPool, ...byRecency.filter((c) => !poolSet.has(c))];
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const run = await prisma.ingestionRun.create({ data: { source: 'board', targetKey: 'all', status: 'RUNNING' } });
  try {
    const { candidates: feedCands, feedErrors } = await collectFeedCandidates();
    let fpCands: BoardCandidate[] = [];
    try {
      fpCands = await collectSubscriptionCandidates(new Date());
      logger.info({ count: fpCands.length }, 'first-party subscription candidates');
    } catch (err) {
      logger.error({ err }, 'first-party subscription collect failed');
    }
    let naverCands: BoardCandidate[] = [];
    try {
      naverCands = await collectNaverNewsCandidates();
    } catch (err) {
      logger.error({ err }, 'naver news collect failed');
    }
    const candidates = [...feedCands, ...fpCands, ...naverCands];
    // 발행일이 90일을 넘거나 없는 후보는 생성 전에 제외(옛날 기사로 글 생성 방지).
    const { kept: recent, staleDropped } = dropStale(candidates, new Date());
    const fresh = await dropExisting(recent);
    const ranked = await rank(fresh);
    logger.info(
      { candidates: candidates.length, staleDropped, fresh: fresh.length, feedErrors, firstParty: fpCands.length },
      'board candidates collected',
    );

    if (dryRun) {
      const top = ranked.slice(0, 8).map((c) => ({
        agency: c.agency,
        title: c.title.slice(0, 40),
        cat: categoryHint(`${c.title}\n${c.bodyText}`),
        chars: c.bodyText.length,
      }));
      console.table(top);
      logger.info({ shown: top.length }, 'DRY RUN — 생성 없이 후보만 출력');
      await prisma.ingestionRun.update({ where: { id: run.id }, data: { status: 'OK', finishedAt: new Date() } });
      return;
    }

    const client = createOpenAiClient(env.OPENAI_API_KEY);
    let created: { slug: string; title: string } | null = null;
    let rejected = 0;
    let duplicate = 0;
    let errors = 0;
    const rejectReasons: string[] = [];

    for (const c of ranked) {
      try {
        const sourceName = c.agency;
        const gen = await generateDraft(client, { sourceText: c.bodyText, sourceName }, env.OPENAI_MODEL);
        const sourceDate = c.pubDate ?? new Date();
        const res = await createDraft({
          gen,
          sourceName,
          sourceUrl: c.link,
          sourceDate,
          sourceExcerpt: c.bodyText.slice(0, 4000),
          dedupeKey: c.dedupeKey,
          dateISO: kstDateISO(sourceDate),
          detectedFrom: categoryHint(`${c.title}\n${c.bodyText}`) ?? c.sourceKey,
        });
        if (res.status === 'created') {
          created = { slug: res.slug, title: gen.title };
          break; // 하루 1건
        }
        if (res.status === 'duplicate') duplicate++;
        if (res.status === 'rejected') {
          rejected++;
          rejectReasons.push(`${c.title.slice(0, 20)}: ${res.violations.join('/')}`);
        }
      } catch (err) {
        errors++;
        logger.error({ err, title: c.title }, 'generate/create failed');
      }
    }

    const summary = {
      created: created?.slug ?? null,
      candidates: candidates.length,
      staleDropped,
      fresh: fresh.length,
      rejected,
      duplicate,
      errors,
      feedErrors,
    };
    // 생성 예외(errors)만 잡 실패로 본다. 일시적 단일 피드 fetch 실패(feedErrors)는
    // 다른 피드·FIRST_PARTY가 살아 있으므로 warn으로만 알리고 잡은 통과시킨다.
    const hadError = errors > 0;
    await prisma.ingestionRun.update({
      where: { id: run.id },
      data: {
        status: hadError ? 'ERROR' : 'OK',
        rowsUpserted: created ? 1 : 0,
        errorMessage: rejectReasons.slice(0, 5).join(' | ') || null,
        finishedAt: new Date(),
      },
    });
    await notify(
      hadError || feedErrors > 0 ? 'warn' : 'info',
      created ? `오늘 게시판 초안 1건 대기: ${created.title}` : '오늘 생성된 게시판 초안 없음',
      summary,
    );
    logger.info(summary, 'board ingest done');
    if (hadError) process.exitCode = 1;
  } catch (err) {
    await prisma.ingestionRun
      .update({ where: { id: run.id }, data: { status: 'ERROR', errorMessage: String(err), finishedAt: new Date() } })
      .catch(() => {});
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  logger.error({ err }, 'board runner fatal');
  process.exit(1);
});
