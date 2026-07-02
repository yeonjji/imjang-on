import { SITE_URL } from '@/lib/site';
import { DATA_SOURCES, type DataSourceId } from '@/lib/data-sources';

type Json = Record<string, unknown>;

const ctx = { '@context': 'https://schema.org' } as const;

export function organizationSchema(): Json {
  return {
    ...ctx,
    '@type': 'Organization',
    name: '임장ON',
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  };
}

export function webSiteSchema(): Json {
  return {
    ...ctx,
    '@type': 'WebSite',
    name: '임장ON',
    url: SITE_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/list?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbSchema(items: BreadcrumbItem[]): Json {
  return {
    ...ctx,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.url,
    })),
  };
}

interface PlaceInput {
  name: string;
  address: string;
  lat?: number | null;
  lng?: number | null;
  url: string;
  image?: string;
  telephone?: string | null;
  openingHours?: string | null;
}

function geoOf(lat?: number | null, lng?: number | null): Json | undefined {
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  return { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
}

function postalAddress(address: string): Json {
  return { '@type': 'PostalAddress', addressCountry: 'KR', streetAddress: address };
}

export function residenceSchema(input: PlaceInput & { id?: string; mainEntityOfPageId?: string }): Json {
  return {
    ...ctx,
    '@type': 'Residence',
    ...(input.id ? { '@id': input.id } : {}),
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
    ...(input.mainEntityOfPageId ? { mainEntityOfPage: { '@id': input.mainEntityOfPageId } } : {}),
  };
}

export type PlaceType = 'School' | 'Hospital' | 'Pharmacy' | 'ChildCare';

export function placeSchema(input: PlaceInput & { type: PlaceType; id?: string; mainEntityOfPageId?: string }): Json {
  return {
    ...ctx,
    '@type': input.type,
    ...(input.id ? { '@id': input.id } : {}),
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
    telephone: input.telephone || undefined,
    openingHours: input.openingHours || undefined,
    ...(input.mainEntityOfPageId ? { mainEntityOfPage: { '@id': input.mainEntityOfPageId } } : {}),
  };
}

export function articleSchema(input: {
  headline: string;
  url: string;
  datePublished: string; // YYYY-MM-DD
  description: string;
  image?: string;
}): Json {
  return {
    ...ctx,
    '@type': 'NewsArticle',
    headline: input.headline,
    description: input.description,
    url: input.url,
    datePublished: input.datePublished,
    image: input.image,
    publisher: { '@type': 'Organization', name: '임장ON', url: SITE_URL },
  };
}

/** 상록 가이드용 Article JSON-LD(board의 NewsArticle과 구분). */
export function guideArticleSchema(input: {
  headline: string;
  url: string;
  description: string;
  datePublished: string; // YYYY-MM-DD
  dateModified?: string;
  image?: string;
}): Json {
  return {
    ...ctx,
    '@type': 'Article',
    headline: input.headline,
    description: input.description,
    url: input.url,
    datePublished: input.datePublished,
    author: { '@type': 'Organization', name: '임장ON 편집부' },
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    ...(input.image ? { image: input.image } : {}),
    publisher: { '@type': 'Organization', name: '임장ON', url: SITE_URL },
  };
}

export function faqSchema(items: { q: string; a: string }[]): Json {
  return {
    ...ctx,
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({
      '@type': 'Question',
      name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: it.a },
    })),
  };
}

/** JSON-LD를 <script>로 렌더한다. 페이지/레이아웃에서 직접 사용. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

const KOGL_LICENSE = 'https://www.kogl.or.kr/info/license.do';

/**
 * 실거래가/공공데이터 상세 공용 출처·신선도 노드
 * (WebPage·GovernmentOrganization·Dataset). 출처는 DATA_SOURCES[sourceId]에서 주입.
 */
export function provenanceNodes(input: {
  url: string;
  name: string;
  sourceId: DataSourceId;
  entityId: string;        // 엔티티 노드 @id (예: `${url}#childcare`)
  dateModified?: string;   // YYYY-MM-DD UTC
  datasetSameAs?: string;  // data.go.kr URL, 미전달 시 생략
}): Json[] {
  const src = DATA_SOURCES[input.sourceId];
  const orgId = `${SITE_URL}/#src-${input.sourceId}`;
  const pageId = `${input.url}#webpage`;
  const dsId = `${input.url}#dataset`;
  return [
    {
      ...ctx,
      '@type': 'WebPage',
      '@id': pageId,
      url: input.url,
      name: `${input.name} | 임장ON`,
      inLanguage: 'ko-KR',
      mainEntity: { '@id': input.entityId },
      isBasedOn: { '@id': dsId },
      sourceOrganization: { '@id': orgId },
      license: KOGL_LICENSE,
      ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    },
    { ...ctx, '@type': 'GovernmentOrganization', '@id': orgId, name: src.provider, url: src.url },
    {
      ...ctx,
      '@type': 'Dataset',
      '@id': dsId,
      name: src.dataset,
      url: src.url,
      creator: { '@id': orgId },
      license: KOGL_LICENSE,
      ...(input.datasetSameAs ? { sameAs: input.datasetSameAs } : {}),
    },
  ];
}

export function aptProvenanceNodes(input: {
  url: string;
  name: string;
  dateModified?: string;
  datasetSameAs?: string;
}): Json[] {
  return provenanceNodes({ ...input, sourceId: 'molit-rtms', entityId: `${input.url}#residence` });
}
