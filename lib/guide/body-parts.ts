import { isGuideDataBlockKey, type GuideDataBlockKey } from '@/lib/guide/data-blocks';

export type GuideBodyPart =
  | { kind: 'markdown'; text: string }
  | { kind: 'block'; key: GuideDataBlockKey };

/** 표식은 한 줄을 통째로 차지해야 한다(앞뒤 공백 제외). 코드펜스 안의 표식은 건드리지 않는다. */
const PLACEHOLDER = /^\s*\[\[data:([a-z0-9-]+)\]\]\s*$/;
/** 펜스 시작/종료: backtick(`) 또는 tilde(~) 3개 이상 */
const FENCE_START = /^(\s*)(```+|~~~+)/;

/**
 * 가이드 본문(splitSummary 후의 rest)을 마크다운 조각과 블록으로 쪼갠다.
 * 표식이 없으면 조각 하나만 나오므로 기존 렌더 경로와 동일하다.
 *
 * CommonMark 호환: 펜스는 같은 문자종류와 길이(이상)로만 닫힌다.
 */
export function splitGuideBody(rest: string): GuideBodyPart[] {
  const parts: GuideBodyPart[] = [];
  let buffer: string[] = [];
  let fenceChar: string | null = null;
  let fenceLength: number = 0;

  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) parts.push({ kind: 'markdown', text });
    buffer = [];
  };

  for (const line of rest.split('\n')) {
    const fenceMatch = FENCE_START.exec(line);

    // 펜스 처리
    if (fenceMatch) {
      const fenceStr = fenceMatch[2];
      const char = fenceStr[0];
      const len = fenceStr.length;

      if (fenceChar === null) {
        // 펜스 시작
        fenceChar = char;
        fenceLength = len;
        buffer.push(line);
        continue;
      }

      if (fenceChar === char && len >= fenceLength) {
        // 펜스 종료: 같은 문자, 같거나 더 긴 길이
        fenceChar = null;
        fenceLength = 0;
        buffer.push(line);
        continue;
      }

      // 다른 문자/부족한 길이 → 코드 내용으로 처리
      buffer.push(line);
      continue;
    }

    // 펜스 밖에서만 표식 판정
    const m = fenceChar === null ? PLACEHOLDER.exec(line) : null;
    if (!m) {
      buffer.push(line);
      continue;
    }

    // 표식 발견
    flush();
    if (isGuideDataBlockKey(m[1])) parts.push({ kind: 'block', key: m[1] });
  }
  flush();
  return parts;
}
