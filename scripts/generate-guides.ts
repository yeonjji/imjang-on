/**
 * 가이드 시드를 순회하며 DRAFT 초안을 생성한다.
 * 실행: pnpm exec dotenv -e .env.local -- tsx scripts/generate-guides.ts [--only=<seedKey>]
 * 이미 존재하는(dedupeKey) 시드는 건너뛴다(createGuideDraft가 duplicate 반환).
 */
import { GUIDE_SEEDS } from '@/lib/guide/seeds';
import { generateGuideDraft } from '@/lib/guide/generate';
import { createGuideDraft } from '@/lib/guide/create-draft';
import { createOpenAiClient } from '@/lib/board/generate';
import { env } from '@/lib/env';

async function main() {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length) : null;
  const seeds = only ? GUIDE_SEEDS.filter((s) => s.key === only) : GUIDE_SEEDS;
  if (seeds.length === 0) {
    console.error(only ? `시드 없음: ${only}` : '시드가 비어 있습니다.');
    process.exit(1);
  }
  const client = createOpenAiClient(env.OPENAI_API_KEY);
  const model = process.env.GUIDE_MODEL ?? 'gpt-4.1';

  for (const seed of seeds) {
    try {
      const llm = await generateGuideDraft(
        client,
        { category: seed.category, topic: seed.title, angle: seed.angle, sourceText: seed.source.excerpt, sourceName: seed.source.name },
        model,
      );
      const res = await createGuideDraft(seed, llm);
      console.log(`${seed.key}: ${res.status}${res.status === 'rejected' ? ` (${res.violations.join(', ')})` : ''}`);
    } catch (err) {
      console.error(`${seed.key}: error — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main().then(() => process.exit(0));
