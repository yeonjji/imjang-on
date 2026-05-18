import { prisma } from '@/lib/db';
import { PropertyType } from '@prisma/client';

export type PropertyTypeSlug = 'apt' | 'officetel' | 'villa';

export function slugToType(slug: PropertyTypeSlug): PropertyType[] {
  if (slug === 'apt') return [PropertyType.APARTMENT];
  if (slug === 'officetel') return [PropertyType.OFFICETEL];
  return [PropertyType.ROW_HOUSE, PropertyType.MULTIPLEX];
}

export function typeToSlug(t: PropertyType): PropertyTypeSlug {
  if (t === PropertyType.APARTMENT) return 'apt';
  if (t === PropertyType.OFFICETEL) return 'officetel';
  return 'villa';
}

export async function getPropertyById(id: bigint) {
  return prisma.property.findUnique({
    where: { id },
    include: { region: true },
  });
}

export interface PropertyListParams {
  types: PropertyType[];
  sigunguCode?: string;
  page?: number;
  perPage?: number;
}

export async function getPropertyList({ types, sigunguCode, page = 1, perPage = 30 }: PropertyListParams) {
  const where: any = { propertyType: { in: types }, txCount12m: { gt: 0 } };
  if (sigunguCode) where.sigunguCode = sigunguCode;
  const [rows, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { region: true },
      orderBy: { lastTxAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.property.count({ where }),
  ]);
  return { rows, total, page, perPage, totalPages: Math.ceil(total / perPage) };
}

export async function getTopPropertiesByVolume({ types, sigunguCode, limit = 10 }: { types: PropertyType[]; sigunguCode?: string; limit?: number }) {
  return prisma.property.findMany({
    where: {
      propertyType: { in: types },
      txCount12m: { gt: 0 },
      ...(sigunguCode ? { sigunguCode } : {}),
    },
    include: { region: true },
    orderBy: { txCount12m: 'desc' },
    take: limit,
  });
}
