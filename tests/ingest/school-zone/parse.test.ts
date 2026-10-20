import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  classifyZoneKind, normalizeEduOffice, isPrimarySchool, markPrimaries, parseLinkCsv, readZoneZip,
} from '@/scripts/ingest/school-zone/parse';

const FX = 'tests/ingest/fixtures/school-zone/';

describe('classifyZoneKind', () => {
  it('학구명으로 유형을 나눈다', () => {
    expect(classifyZoneKind('서울대청초통학구역')).toBe('general');
    expect(classifyZoneKind('가남초가양초공동통학구역')).toBe('shared');
    expect(classifyZoneKind('구곡초교동초공통통학구역')).toBe('shared'); // 원문 오타
    expect(classifyZoneKind('대전신흥초세천초공동(일방)통학구역')).toBe('shared_oneway');
    expect(classifyZoneKind('가남초광역통학구역')).toBe('wide');
  });
});

describe('normalizeEduOffice', () => {
  it('통합 전 광주·전남 교육청명을 현재 이름으로', () => {
    expect(normalizeEduOffice('광주광역시교육청')).toBe('전남광주통합특별시교육청(광주)');
    expect(normalizeEduOffice('전라남도교육청')).toBe('전남광주통합특별시교육청(전남)');
    expect(normalizeEduOffice('서울특별시교육청')).toBe('서울특별시교육청');
  });
});

describe('기본 학교', () => {
  it('광역은 학구명 접두어로 기본 학교를 고른다("(휴교)" 등 부가 표기 무시)', () => {
    expect(isPrimarySchool('가남초광역통학구역', 'wide', '가남초등학교')).toBe(true);
    expect(isPrimarySchool('가남초광역통학구역', 'wide', '물금초등학교')).toBe(false);
    expect(isPrimarySchool('동방초광역통학구역', 'wide', '동방초등학교(휴교)')).toBe(true);
    expect(isPrimarySchool('가남초가양초공동통학구역', 'shared', '가양초등학교')).toBe(true);
  });
  it('광역인데 기본 학교를 못 찾으면 전원을 기본으로', () => {
    const zones = [{ hakgudoId: 'Z1', name: '이상한광역통학구역', kind: 'wide' as const, eduName: null, baseDate: '2025-09-22', geometry: null }];
    const links = [
      { hakgudoId: 'Z1', schId: 'B1', schoolName: '가초등학교', eduOffice: 'x' },
      { hakgudoId: 'Z1', schId: 'B2', schoolName: '나초등학교', eduOffice: 'x' },
    ];
    expect(markPrimaries(zones, links).every((l) => l.isPrimary)).toBe(true);
  });
});

describe('파일 파싱', () => {
  it('zip(CP949 파일명)에서 SHP·DBF(EUC-KR)를 읽는다', async () => {
    const zones = await readZoneZip(new Uint8Array(readFileSync(FX + 'zone.zip')));
    expect(zones.map((z) => [z.hakgudoId, z.name, z.kind])).toEqual([
      ['Z000000001', '테스트초통학구역', 'general'],
      ['Z000000002', '가람초나래초공동통학구역', 'shared'],
      ['Z000000003', '가람초광역통학구역', 'wide'],
    ]);
    expect(zones[0].eduName).toBe('서울특별시강남서초교육지원청');
    expect(zones[0].baseDate).toBe('2025-09-22');
    expect((zones[0].geometry as { type: string }).type).toBe('Polygon');
  });
  it('CSV(CP949)에서 초등학교만, 교육청명은 정규화', () => {
    const links = parseLinkCsv(new Uint8Array(readFileSync(FX + 'link.csv')));
    expect(links).toHaveLength(5);
    expect(links.find((l) => l.schoolName === '먼산초등학교')!.eduOffice).toBe('전남광주통합특별시교육청(광주)');
  });
});
