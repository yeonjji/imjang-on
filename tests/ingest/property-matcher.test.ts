import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { findOrCreateProperty } from '@/scripts/ingest/property-matcher';
import { PropertyType } from '@prisma/client';
import { assertLocalDatabase } from '../_helpers/assert-local-db';

vi.mock('@/scripts/ingest/geocoder', async (importActual) => {
  const actual = await importActual<typeof import('@/scripts/ingest/geocoder')>();
  return {
    ...actual,
    geocode: vi.fn().mockResolvedValue({ lat: 37.5, lng: 127.0, region1: null, region2: null }),
  };
});

describe('property-matcher', () => {
  beforeEach(async () => {
    assertLocalDatabase();
    await prisma.transaction.deleteMany();
    await prisma.property.deleteMany();
  });

  it('1차: exact match on (type, name, sigungu)', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    const created = await prisma.property.create({
      data: { propertyType: PropertyType.APARTMENT, name: '래미안', nameNorm: '래미안', regionCode: '1165010100', address: '서울 서초구' },
    });

    const found = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '래미안',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구',
      buildYear: 2010,
      roadName: null,
    });
    expect(found.id).toBe(created.id);
  });

  it('3차: creates new property when not found', async () => {
    await prisma.region.upsert({
      where: { code: '1165010100' },
      create: { code: '1165010100', sido: '서울', sigungu: '서초구', eupmyeondong: '서초동', fullName: '서울 서초구 서초동', level: 3, sourceVersion: 'test' },
      update: {},
    });
    const p = await findOrCreateProperty({
      propertyType: PropertyType.APARTMENT,
      name: '신규단지',
      sigunguCode: '11650',
      regionCode: '1165010100',
      address: '서울 서초구 서초동 1',
      buildYear: 2024,
      roadName: null,
    });
    expect(p.id).toBeDefined();
    expect(p.name).toBe('신규단지');
  });
});
