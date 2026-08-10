import { isGuideDataBlockKey, type GuideDataBlockKey } from '@/lib/guide/data-blocks';

export type GuideBodyPart =
  | { kind: 'markdown'; text: string }
  | { kind: 'block'; key: GuideDataBlockKey };

/** 표식은 한 줄을 통째로 차지해야 한다. 코드펜스 안의 표식은 건드리지 않는다. */
const PLACEHOLDER = /^\[\[data:([a-z0-9-]+)\]\][ \t]*$/;
const FENCE = /^\s*(```|~~~)/;

/**
 * 가이드 본문(splitSummary 후의 rest)을 마크다운 조각과 블록으로 쪼갠다.
 * 표식이 없으면 조각 하나만 나오므로 기존 렌더 경로와 동일하다.
 */
export function splitGuideBody(rest: string): GuideBodyPart[] {
  const parts: GuideBodyPart[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) parts.push({ kind: 'markdown', text });
    buffer = [];
  };

  for (const line of rest.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;
    const m = inFence ? null : PLACEHOLDER.exec(line);
    if (!m) {
      buffer.push(line);
      continue;
    }
    flush();
    if (isGuideDataBlockKey(m[1])) parts.push({ kind: 'block', key: m[1] });
  }
  flush();
  return parts;
}
