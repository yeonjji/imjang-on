import { describe, it, expect } from 'vitest';
import { OgMapFrame } from '@/lib/seo/og';

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

  it('캡션 바는 네이버 정사각 크롭에서 살아남도록 중앙정렬이다', () => {
    const tree = OgMapFrame({ mapDataUri: 'data:image/png;base64,AAAA', title: 'A', subtitle: 'B' });
    const json = JSON.stringify(tree);
    expect(json).toContain('"alignItems":"center"');
  });
});
