import { describe, it, expect } from 'vitest';
import {
  organizationSchema,
  webSiteSchema,
  breadcrumbSchema,
  residenceSchema,
  placeSchema,
  faqSchema,
} from '@/lib/seo/json-ld';

describe('organizationSchema', () => {
  it('has Organization type and name', () => {
    const s = organizationSchema();
    expect(s['@type']).toBe('Organization');
    expect(s.name).toBe('임장ON');
    expect(typeof s.url).toBe('string');
  });
});

describe('webSiteSchema', () => {
  it('exposes a SearchAction pointing at the list page', () => {
    const s = webSiteSchema();
    const action = s.potentialAction as Record<string, unknown>;
    expect(s['@type']).toBe('WebSite');
    expect(action['@type']).toBe('SearchAction');
    expect(String((action.target as Record<string, unknown>).urlTemplate)).toContain('/list');
  });
});

describe('breadcrumbSchema', () => {
  it('numbers positions starting at 1', () => {
    const s = breadcrumbSchema([
      { name: '홈', url: 'https://x/' },
      { name: '병원', url: 'https://x/medical/hospital' },
    ]);
    const items = s.itemListElement as Record<string, unknown>[];
    expect(s['@type']).toBe('BreadcrumbList');
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
    expect(items[1].name).toBe('병원');
  });
});

describe('residenceSchema', () => {
  it('maps address/geo/image', () => {
    const s = residenceSchema({
      name: '래미안',
      address: '서울 송파구 송파대로 345',
      lat: 37.5,
      lng: 127.1,
      url: 'https://x/apt/1',
      image: 'https://x/api/staticmap?lat=37.5&lng=127.1',
    });
    const addr = s.address as Record<string, unknown>;
    expect(s['@type']).toBe('Residence');
    expect(addr['@type']).toBe('PostalAddress');
    expect(addr.addressCountry).toBe('KR');
    expect(s.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 37.5, longitude: 127.1 });
    expect(s.image).toContain('/api/staticmap');
  });

  it('omits geo when coords missing', () => {
    const s = residenceSchema({ name: 'x', address: 'y', url: 'https://x/apt/2' });
    expect(s.geo).toBeUndefined();
  });
});

describe('placeSchema', () => {
  it('uses the given schema.org type', () => {
    const s = placeSchema({
      type: 'Hospital',
      name: '온가족정신건강의학과의원',
      address: '서울 송파구 송파대로 345',
      lat: 37.5,
      lng: 127.1,
      url: 'https://x/medical/hospital/11710/1',
    });
    expect(s['@type']).toBe('Hospital');
    expect(s.name).toContain('온가족');
  });
});

describe('faqSchema', () => {
  const items = [
    { q: '아파트 실거래가는 어디서 확인하나요?', a: '국토교통부 실거래가 공개시스템 신고 자료를 단지별로 정리해 제공합니다.' },
    { q: '실거래가와 호가는 어떻게 다른가요?', a: '실거래가는 실제 체결·신고된 금액이고, 호가는 매도인의 희망 가격입니다.' },
  ];

  it('FAQPage 타입과 schema.org 컨텍스트를 가진다', () => {
    const s = faqSchema(items) as Record<string, unknown>;
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toBe('FAQPage');
  });

  it('각 항목을 Question/acceptedAnswer로 매핑한다', () => {
    const s = faqSchema(items) as { mainEntity: Array<Record<string, unknown>> };
    expect(s.mainEntity).toHaveLength(2);
    const first = s.mainEntity[0];
    expect(first['@type']).toBe('Question');
    expect(first.name).toBe(items[0].q);
    const ans = first.acceptedAnswer as Record<string, unknown>;
    expect(ans['@type']).toBe('Answer');
    expect(ans.text).toBe(items[0].a);
  });
});
