import { describe, it, expect } from 'vitest';
import { ImageResponse } from 'next/og';
import { OgFrame, OgMapFrame, loadOgFonts, OG_SIZE } from '@/lib/seo/og';

/** satori에 넘길 요소 트리를 평탄화해 텍스트와 img src를 뽑는다. */
function collect(node: unknown, out: { texts: string[]; imgs: string[] }) {
  if (node === null || node === undefined || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.texts.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    for (const c of node) collect(c, out);
    return out;
  }
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (el.type === 'img' && typeof el.props?.src === 'string') out.imgs.push(el.props.src);
  if (el.props?.children !== undefined) collect(el.props.children, out);
  return out;
}

/** caption 바의 title/subtitle 텍스트 정렬을 검증한다. */
function findCaptionTexts(node: unknown): { title?: { textAlign?: string }; subtitle?: { textAlign?: string } } {
  const result: { title?: { textAlign?: string }; subtitle?: { textAlign?: string } } = {};
  function walk(el: unknown) {
    if (!el || typeof el !== 'object') return;
    const node = el as { props?: Record<string, unknown>; type?: unknown };
    if (node.props?.style && typeof node.props.style === 'object') {
      const style = node.props.style as Record<string, unknown>;
      // title: fontSize 54, subtitle: fontSize 30
      if (style.fontSize === 54) {
        result.title = { textAlign: style.textAlign as string | undefined };
      }
      if (style.fontSize === 30) {
        result.subtitle = { textAlign: style.textAlign as string | undefined };
      }
    }
    if (node.props?.children) {
      const children = node.props.children;
      if (Array.isArray(children)) {
        for (const c of children) walk(c);
      } else {
        walk(children);
      }
    }
  }
  walk(node);
  return result;
}

describe('OgMapFrame', () => {
  it('지도 data URI와 캡션 2줄을 담는다', () => {
    const tree = OgMapFrame({
      mapDataUri: 'data:image/png;base64,AAAA',
      title: '명성푸르지오',
      subtitle: '대구광역시 북구 · 임장ON',
    });
    const { texts, imgs } = collect(tree, { texts: [], imgs: [] });

    expect(imgs).toContain('data:image/png;base64,AAAA');
    expect(texts).toContain('명성푸르지오');
    expect(texts).toContain('대구광역시 북구 · 임장ON');
  });

  it('캡션 바의 title과 subtitle은 textAlign: center로 중앙정렬된다', () => {
    const tree = OgMapFrame({ mapDataUri: 'data:image/png;base64,AAAA', title: 'A', subtitle: 'B' });
    const captions = findCaptionTexts(tree);

    expect(captions.title?.textAlign).toBe('center');
    expect(captions.subtitle?.textAlign).toBe('center');
  });

  it(
    'satori가 OgMapFrame을 렌더링할 수 있다',
    async () => {
      const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const fonts = await loadOgFonts();
      const response = new ImageResponse(
        OgMapFrame({
          mapDataUri: tinyPng,
          title: '아주 긴 단지명 테스트용 문자열입니다',
          subtitle: '대구광역시 북구 산격동 · 임장ON',
        }),
        { ...OG_SIZE, fonts },
      );

      expect(response.status).toBe(200);
      const buf = Buffer.from(await response.arrayBuffer());
      expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47'); // PNG magic
      expect(buf.length).toBeGreaterThan(1000);
    },
    60_000,
  );

  it(
    'satori가 OgFrame을 렌더링할 수 있다',
    async () => {
      const fonts = await loadOgFonts();
      const response = new ImageResponse(
        OgFrame({
          title: '테스트',
          subtitle: '제목',
        }),
        { ...OG_SIZE, fonts },
      );

      expect(response.status).toBe(200);
      const buf = Buffer.from(await response.arrayBuffer());
      expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47'); // PNG magic
      expect(buf.length).toBeGreaterThan(1000);
    },
    60_000,
  );
});
