/**
 * 학구도 파일 파싱. 한국지방교육행정연구재단 배포본(반기, 3·9월).
 * - SHP: EPSG:5186, DBF EUC-KR, zip 내부 파일명 CP949 → 이름 대신 확장자로 고른다.
 * - CSV: CP949(UTF-8이면 그대로).
 * 좌표 변환은 하지 않는다(적재 시 DB의 ST_Transform).
 */
import { unzipSync } from 'fflate';
import { open } from 'shapefile';

export type ZoneKind = 'general' | 'shared' | 'shared_oneway' | 'wide';

export interface ZoneInput {
  hakgudoId: string;
  name: string;
  kind: ZoneKind;
  eduName: string | null;
  baseDate: string;
  geometry: unknown;
}

export interface LinkInput {
  hakgudoId: string;
  schId: string;
  schoolName: string;
  eduOffice: string;
}

export function classifyZoneKind(name: string): ZoneKind {
  if (name.includes('광역')) return 'wide';
  if (name.includes('일방')) return 'shared_oneway';
  if (name.includes('공동') || name.includes('공통')) return 'shared';
  return 'general';
}

/** 2026-07 광주·전남 통합으로 School.eduOffice가 새 이름이다(학구도는 옛 이름). */
const OFFICE_ALIAS: Record<string, string> = {
  광주광역시교육청: '전남광주통합특별시교육청(광주)',
  전라남도교육청: '전남광주통합특별시교육청(전남)',
};
export function normalizeEduOffice(name: string): string {
  return OFFICE_ALIAS[name] ?? name;
}

/** 광역통학구역의 기본 학교 = 학구명이 학교 약칭('가남초')으로 시작. 그 외 유형은 모두 기본. */
export function isPrimarySchool(zoneName: string, kind: ZoneKind, schoolName: string): boolean {
  if (kind !== 'wide') return true;
  return zoneName.startsWith(schoolName.replace(/초등학교.*$/, '초'));
}

export function markPrimaries(zones: ZoneInput[], links: LinkInput[]): (LinkInput & { isPrimary: boolean })[] {
  const zoneById = new Map(zones.map((z) => [z.hakgudoId, z]));
  const out = links.map((l) => {
    const z = zoneById.get(l.hakgudoId);
    return { ...l, isPrimary: z ? isPrimarySchool(z.name, z.kind, l.schoolName) : true };
  });
  const byZone = new Map<string, (LinkInput & { isPrimary: boolean })[]>();
  for (const l of out) byZone.set(l.hakgudoId, [...(byZone.get(l.hakgudoId) ?? []), l]);
  // 기본 학교를 못 찾은 학구는 전원을 기본으로 — 빈 기본 목록은 화면이 비게 만든다.
  for (const ls of byZone.values()) if (!ls.some((l) => l.isPrimary)) for (const l of ls) l.isPrimary = true;
  return out;
}

function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('euc-kr').decode(bytes);
  }
}

export function parseLinkCsv(bytes: Uint8Array): LinkInput[] {
  const [header, ...lines] = decodeText(bytes).split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = header.split(',').map((c) => c.trim());
  const col = (n: string) => {
    const i = cols.indexOf(n);
    if (i < 0) throw new Error(`link csv: '${n}' 열이 없다`);
    return i;
  };
  const [iZone, iSch, iName, iKind, iOffice] = ['학구ID', '학교ID', '학교명', '학교급구분', '시도교육청명'].map(col);
  return lines
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c[iKind] === '초등학교')
    .map((c) => ({ hakgudoId: c[iZone], schId: c[iSch], schoolName: c[iName], eduOffice: normalizeEduOffice(c[iOffice]) }));
}

const toArrayBuffer = (u: Uint8Array): ArrayBuffer => u.slice().buffer;

export async function readZoneZip(bytes: Uint8Array): Promise<ZoneInput[]> {
  const files = unzipSync(bytes);
  const pick = (ext: string) => {
    const key = Object.keys(files).find((n) => n.toLowerCase().endsWith(ext));
    if (!key) throw new Error(`zone zip: ${ext} 파일이 없다`);
    return files[key];
  };
  const source = await open(toArrayBuffer(pick('.shp')), toArrayBuffer(pick('.dbf')), { encoding: 'euc-kr' });
  const zones: ZoneInput[] = [];
  for (;;) {
    const r = await source.read();
    if (r.done) break;
    const p = r.value.properties as Record<string, unknown>;
    const name = String(p.HAKGUDO_NM ?? '').trim();
    const edu = String(p.EDU_NM ?? '').trim();
    zones.push({
      hakgudoId: String(p.HAKGUDO_ID ?? '').trim(),
      name,
      kind: classifyZoneKind(name),
      eduName: edu || null,
      baseDate: String(p.BASE_DT ?? '').trim(),
      geometry: r.value.geometry,
    });
  }
  return zones;
}
