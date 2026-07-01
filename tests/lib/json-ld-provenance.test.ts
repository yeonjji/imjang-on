import { describe, it, expect } from 'vitest';
import { aptProvenanceNodes, residenceSchema } from '@/lib/seo/json-ld';

const URL = 'https://imjangon.co.kr/apt/123';

describe('aptProvenanceNodes', () => {
  it('WebPage·GovernmentOrganization·Dataset 3노드를 @id로 연결한다', () => {
    const nodes = aptProvenanceNodes({ url: URL, name: '○○아파트' }) as Record<string, any>[];
    const page = nodes.find((n) => n['@type'] === 'WebPage')!;
    const gov = nodes.find((n) => n['@type'] === 'GovernmentOrganization')!;
    const ds = nodes.find((n) => n['@type'] === 'Dataset')!;
    expect(nodes).toHaveLength(3);
    expect(page.isBasedOn['@id']).toBe(ds['@id']);
    expect(page.sourceOrganization['@id']).toBe(gov['@id']);
    expect(ds.creator['@id']).toBe(gov['@id']);
    expect(gov.name).toBe('국토교통부');
    expect(page.mainEntity['@id']).toBe(`${URL}#residence`);
  });

  it('dateModified는 전달 시에만 포함된다', () => {
    const without = aptProvenanceNodes({ url: URL, name: 'x' })[0] as Record<string, any>;
    expect('dateModified' in without).toBe(false);
    const withDate = aptProvenanceNodes({ url: URL, name: 'x', dateModified: '2026-06-20' })[0] as Record<string, any>;
    expect(withDate.dateModified).toBe('2026-06-20');
  });

  it('datasetSameAs는 전달 시에만 포함된다(미전달=추정 금지)', () => {
    const ds = (aptProvenanceNodes({ url: URL, name: 'x' }) as Record<string, any>[]).find((n) => n['@type'] === 'Dataset')!;
    expect('sameAs' in ds).toBe(false);
  });
});

describe('residenceSchema 확장', () => {
  it('id·mainEntityOfPageId 전달 시 @id와 mainEntityOfPage를 세팅', () => {
    const r = residenceSchema({ name: 'x', address: '주소', url: URL, id: `${URL}#residence`, mainEntityOfPageId: `${URL}#webpage` }) as Record<string, any>;
    expect(r['@id']).toBe(`${URL}#residence`);
    expect(r.mainEntityOfPage['@id']).toBe(`${URL}#webpage`);
  });
  it('선택 필드 미전달 시 기존과 동일(하위호환)', () => {
    const r = residenceSchema({ name: 'x', address: '주소', url: URL }) as Record<string, any>;
    expect('@id' in r).toBe(false);
    expect('mainEntityOfPage' in r).toBe(false);
  });
});
