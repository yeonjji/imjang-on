import type { UrbanCategoryDef } from '@/lib/urban/category';

export const parkingDef: UrbanCategoryDef = {
  slug: 'parking',
  label: '주차장',
  emoji: '🅿️',
  breadcrumbLabel: '주차장',
  requiresSidoScope: true,
  subFilters: {
    paramKey: 'sub',
    defaultSlug: 'all',
    options: [
      { slug: 'all', label: '전체' },
      { slug: '공영', label: '공영' },
      { slug: '민영', label: '민영' },
    ],
  },
  async getList() { throw new Error('not implemented'); },
  async getById() { return null; },
  async getLatLng() { return null; },
  inferRowSummary: () => null,
  detailFields: () => [],
  renderRichSections: () => null,
};
