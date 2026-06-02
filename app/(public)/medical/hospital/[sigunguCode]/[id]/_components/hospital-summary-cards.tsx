// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-summary-cards.tsx
'use client';
import type { ComponentProps } from 'react';
import { formatHospitalTime } from '@/lib/hospital/utils';
import type { HospitalFacility, HospitalDetail } from '@prisma/client';

// getDay() 반환값(0=일,1=월,...,6=토)에 대응하는 open/close 키
const DAY_KEYS = [
  ['openSun', 'closeSun'],
  ['openMon', 'closeMon'],
  ['openTue', 'closeTue'],
  ['openWed', 'closeWed'],
  ['openThu', 'closeThu'],
  ['openFri', 'closeFri'],
  ['openSat', 'closeSat'],
] as const;

interface Props {
  totalDoctors: number | null;
  facility: HospitalFacility | null;
  detail: HospitalDetail | null;
}

function SummaryCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-soft)] p-4 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{label}</p>
      <p className="font-bold text-[var(--color-blue-dark)]">{value}</p>
      {sub && <p className="text-[11px] text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export function HospitalSummaryCards({ totalDoctors, facility, detail }: Props) {
  const cards: ComponentProps<typeof SummaryCard>[] = [];

  if (totalDoctors != null) {
    cards.push({ icon: '👨‍⚕️', label: '의료진', value: `전문의 ${totalDoctors}명` });
  }

  if (facility) {
    const beds = (facility.generalBedPremium ?? 0) + (facility.generalBedNormal ?? 0);
    if (beds > 0) {
      cards.push({ icon: '🛏', label: '병상', value: `${beds.toLocaleString()}개`, sub: '일반병상 기준' });
    }
  }

  if (detail) {
    if (detail.erDayOpen != null) {
      const hasEr = detail.erDayOpen === 'Y' || detail.erNightOpen === 'Y';
      cards.push({ icon: '🚑', label: '응급실', value: hasEr ? '운영' : '미운영', sub: hasEr ? '24시간' : undefined });
    }
    if (detail.parkingCapacity != null) {
      cards.push({
        icon: '🚗', label: '주차', value: `${detail.parkingCapacity}대`,
        sub: detail.parkingFee === 'Y' ? '유료' : '무료',
      });
    }
    const dayIdx = new Date().getDay();
    const [openKey, closeKey] = DAY_KEYS[dayIdx];
    const open = detail[openKey];
    const close = detail[closeKey];
    if (open != null || close != null) {
      cards.push({
        icon: '🕐', label: '오늘 진료',
        value: open != null ? `${formatHospitalTime(open)} ~ ${formatHospitalTime(close)}` : '휴진',
      });
    }
  }

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(c => <SummaryCard key={c.label} {...c} />)}
    </div>
  );
}
