import { describe, it, expect } from 'vitest';
import {
  organizationSchema,
  webSiteSchema,
  breadcrumbSchema,
  residenceSchema,
  placeSchema,
} from '@/lib/seo/json-ld';

describe('organizationSchema', () => {
  it('has Organization type and name', () => {
    const s = organizationSchema();
    expect(s['@type']).toBe('Organization');
    expect(s.name).toBe('임장온');
    expect(typeof s.url).toBe('string');
  });
});

describe('webSiteSchema', () => {
  it('exposes a SearchAction pointing at the list page', () => {
    const s = webSiteSchema();
    expect(s['@type']).toBe('WebSite');
    expect(s.potentialAction['@type']).toBe('SearchAction');
    expect(String(s.potentialAction.target.urlTemplate)).toContain('/list');
  });
});

describe('breadcrumbSchema', () => {
  it('numbers positions starting at 1', () => {
    const s = breadcrumbSchema([
      { name: '홈', url: 'https://x/' },
      { name: '병원', url: 'https://x/medical/hospital' },
    ]);
    expect(s['@type']).toBe('BreadcrumbList');
    expect(s.itemListElement[0].position).toBe(1);
    expect(s.itemListElement[1].position).toBe(2);
    expect(s.itemListElement[1].name).toBe('병원');
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
    expect(s['@type']).toBe('Residence');
    expect(s.address['@type']).toBe('PostalAddress');
    expect(s.address.addressCountry).toBe('KR');
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
