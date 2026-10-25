import { runGuideGuardrails } from '@/lib/guide/guardrails';
import { isGuideDataBlockKey } from '@/lib/guide/data-blocks';

/**
 * 가이드 재작성 초안(content/guides/<slug>.md) 파싱·검증. 2026-10 5-3단계.
 * 형식: `---\ntitle: …\nsummary: …\n---\n<본문 마크다운>`. 본문은 GuideBody(react-markdown + GFM)로
 * 렌더되므로 raw HTML은 쓰지 않는다(렌더되지 않음).
 */
export interface GuideDraft {
  title: string;
  summary: string;
  body: string;
}

export function parseGuideDraft(text: string): GuideDraft {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error('앞머리(---) 없음');
  const field = (k: string) => new RegExp(`^${k}:[ \\t]*(.*)$`, 'm').exec(m[1])?.[1]?.trim() ?? '';
  const title = field('title');
  const summary = field('summary');
  if (!title || !summary) throw new Error('title·summary 필요');
  return { title, summary, body: m[2].trim() };
}

export function validateGuideDraft(d: GuideDraft, source: { sourceName: string; sourceUrl: string }): string[] {
  const errors = runGuideGuardrails({ body: d.body, ...source }).violations;
  for (const [, key] of d.body.matchAll(/\[\[data:([a-z0-9-]+)\]\]/g)) {
    if (!isGuideDataBlockKey(key)) errors.push(`알 수 없는 데이터 블록: ${key}`);
  }
  if (/<\/?[a-z][^>]*>/i.test(d.body)) errors.push('HTML 태그는 렌더되지 않음');
  return errors;
}
