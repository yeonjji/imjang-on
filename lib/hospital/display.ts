// 병원 상세 탭의 표시 판정(컴포넌트·목록 점수 공용). 출력 규칙을 바꾸면 화면과 점수가 같이 바뀐다.
import type { HospitalWithRelations } from '@/lib/hospital';
import type { HoursView } from '@/lib/hospital/hours';

export type DoctorCounts = { general: number | null; intern: number | null; resident: number | null; specialist: number | null };
export interface HospitalDoctorInput { med: DoctorCounts; dent: DoctorCounts; kor: DoctorCounts }

// 자격별 인원을 "전문의 N명 · 레지던트 N명 · ..." 형태로 (0/null은 생략)
export function hospitalDoctorParts(c: DoctorCounts): string | null {
  const parts = ([
    ['specialist', '전문의'],
    ['resident', '레지던트'],
    ['intern', '인턴'],
    ['general', '일반의'],
  ] as const)
    .filter(([k]) => (c[k] ?? 0) > 0)
    .map(([k, label]) => `${label} ${c[k]}명`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function hospitalDoctorRows(d: HospitalDoctorInput): { label: string; parts: string }[] {
  return [
    { label: '의사', parts: hospitalDoctorParts(d.med) },
    { label: '치과의사', parts: hospitalDoctorParts(d.dent) },
    { label: '한의사', parts: hospitalDoctorParts(d.kor) },
  ].filter((r): r is { label: string; parts: string } => r.parts != null);
}

type DrFields = Pick<HospitalWithRelations,
  'drMedGeneral' | 'drMedIntern' | 'drMedResident' | 'drMedSpecialist' |
  'drDentGeneral' | 'drDentIntern' | 'drDentResident' | 'drDentSpecialist' |
  'drKorGeneral' | 'drKorIntern' | 'drKorResident' | 'drKorSpecialist'>;

export function hospitalDoctorsFrom(h: DrFields): HospitalDoctorInput {
  return {
    med: { general: h.drMedGeneral, intern: h.drMedIntern, resident: h.drMedResident, specialist: h.drMedSpecialist },
    dent: { general: h.drDentGeneral, intern: h.drDentIntern, resident: h.drDentResident, specialist: h.drDentSpecialist },
    kor: { general: h.drKorGeneral, intern: h.drKorIntern, resident: h.drKorResident, specialist: h.drKorSpecialist },
  };
}

export const BED_ROWS = [
  { key: 'generalBedPremium', label: '일반병상(상급)' },
  { key: 'generalBedNormal', label: '일반병상(일반)' },
  { key: 'icuAdultBed', label: '중환자실(성인)' },
  { key: 'icuPediatricBed', label: '중환자실(소아)' },
  { key: 'icuNeonatalBed', label: '중환자실(신생아)' },
  { key: 'deliveryBed', label: '분만실' },
  { key: 'operatingRoomBed', label: '수술실' },
  { key: 'erBed', label: '응급실 병상' },
  { key: 'physicalTherapyBed', label: '물리치료실' },
  { key: 'isolationBed', label: '격리실' },
  { key: 'sterileRoomBed', label: '무균실' },
  { key: 'psychiatryClosedPremium', label: '정신병동(폐쇄·상급)' },
  { key: 'psychiatryClosedNormal', label: '정신병동(폐쇄·일반)' },
  { key: 'psychiatryOpenPremium', label: '정신병동(개방·상급)' },
  { key: 'psychiatryOpenNormal', label: '정신병동(개방·일반)' },
] as const;
export type BedKey = (typeof BED_ROWS)[number]['key'];

export function hospitalVisibleBeds(f: Partial<Record<BedKey, number | null>> | null): (typeof BED_ROWS)[number][] {
  if (!f) return [];
  return BED_ROWS.filter((r) => (f[r.key] ?? 0) > 0);
}

type DetailHourFields = Pick<NonNullable<HospitalWithRelations['detail']>, 'lunchWeekday' | 'lunchSaturday' | 'closedSunday' | 'closedHoliday'>;

// 진료시간 섹션 표시 규칙: 점심·휴진 문구는 심평원 출처일 때만(출처를 섞지 않는다).
export function hospitalHasHourInfo(detail: Partial<DetailHourFields> | null, hours: HoursView | null): boolean {
  const hira = hours?.source !== 'nemc';
  const days = hours?.days ?? [];
  return (
    days.length > 0 ||
    !!hours?.note ||
    (hira && !!(detail?.lunchWeekday || detail?.lunchSaturday || detail?.closedSunday || detail?.closedHoliday))
  );
}
