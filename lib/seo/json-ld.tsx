import { SITE_URL } from '@/lib/site';

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

export function residenceSchema(input: PlaceInput): Json {
  return {
    ...ctx,
    '@type': 'Residence',
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
  };
}

export type PlaceType = 'School' | 'Hospital' | 'Pharmacy' | 'ChildCare';

export function placeSchema(input: PlaceInput & { type: PlaceType }): Json {
  return {
    ...ctx,
    '@type': input.type,
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
    geo: geoOf(input.lat, input.lng),
    image: input.image,
    telephone: input.telephone || undefined,
    openingHours: input.openingHours || undefined,
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

/** JSON-LD를 <script>로 렌더한다. 페이지/레이아웃에서 직접 사용. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
