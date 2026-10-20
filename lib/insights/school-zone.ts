/** 배정 초등학교 섹션 표시 모델(순수). 단정·평가 문구는 컴포넌트에도 두지 않는다. */
import { kstDate } from '@/lib/insights/maintenance-cost';

export type ZoneKind = 'general' | 'shared' | 'shared_oneway' | 'wide';

export interface SchoolZoneRow {
  hakgudoId: string;
  zoneName: string;
  kind: string;
  eduName: string | null;
  baseDate: Date;
  schoolName: string;
  isPrimary: boolean;
  schoolId: bigint | null;
  schoolSigunguCode: string | null;
  distanceM: number | null;
}

export interface ZoneSchool {
  name: string;
  href: string | null;
  distanceLabel: string | null;
}

export interface SchoolZoneView {
  zoneName: string;
  kind: ZoneKind;
  kindLabel: string | null;
  eduName: string | null;
  baseDateLabel: string;
  /** 임장ON이 마지막으로 적재(조회)한 날짜, KST. 적재 기록이 없으면 null. */
  loadedAtLabel: string | null;
  primary: ZoneSchool[];
  others: ZoneSchool[];
}

const KIND_LABEL: Record<ZoneKind, string | null> = {
  general: null,
  shared: '공동통학구역',
  shared_oneway: '공동(일방)통학구역',
  wide: '광역통학구역',
};

export function formatDistance(m: number): string {
  return m < 1000 ? `약 ${Math.max(10, Math.round(m / 10) * 10)}m` : `약 ${(m / 1000).toFixed(1)}km`;
}

const asKind = (k: string): ZoneKind => (k in KIND_LABEL ? (k as ZoneKind) : 'general');

export function buildSchoolZoneView(rows: SchoolZoneRow[], loadedAt: Date | null = null): SchoolZoneView | null {
  if (rows.length === 0) return null;
  // 학구가 둘 이상 잡히면(실측 0건) ID 순 첫 학구만 쓴다.
  const zoneId = [...new Set(rows.map((r) => r.hakgudoId))].sort()[0];
  const zr = rows.filter((r) => r.hakgudoId === zoneId);
  const z = zr[0];
  const toSchool = (r: SchoolZoneRow): ZoneSchool => ({
    name: r.schoolName,
    href: r.schoolId !== null && r.schoolSigunguCode ? `/school/${r.schoolSigunguCode}/${r.schoolId}` : null,
    distanceLabel: r.distanceM !== null ? formatDistance(r.distanceM) : null,
  });
  const order = (a: SchoolZoneRow, b: SchoolZoneRow) =>
    (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.schoolName.localeCompare(b.schoolName, 'ko');
  const kind = asKind(z.kind);
  return {
    zoneName: z.zoneName,
    kind,
    kindLabel: KIND_LABEL[kind],
    eduName: z.eduName,
    baseDateLabel: z.baseDate.toISOString().slice(0, 10),
    loadedAtLabel: loadedAt ? kstDate(loadedAt) : null,
    primary: zr.filter((r) => r.isPrimary).sort(order).map(toSchool),
    others: zr.filter((r) => !r.isPrimary).sort(order).map(toSchool),
  };
}
