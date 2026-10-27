// app/(public)/medical/hospital/[sigunguCode]/[id]/_components/hospital-summary-cards.tsx
'use client';
import type { ComponentProps } from 'react';
import type { HospitalFacility, HospitalDetail } from '@prisma/client';


interface Props {
  totalDoctors: number | null;
  facility: HospitalFacility | null;
  detail: HospitalDetail | null;
  /** 요일별 진료시간(인덱스 = Date#getDay, 0=일). effectiveHours에서 만든다 — 탭과 같은 값. */
  weekHours: (string | null)[] | null;
}

function SummaryCard({ icon, label, value, sub }: { icon: string; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-[var(--color-soft)] p-4 text-center">
      <span className="text-2xl">{icon}</span>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{label}</p>
      <p className="font-bold text-[var(--color-blue-dark)]">{value}</p>
      {sub && <p className="text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export function HospitalSummaryCards({ totalDoctors, facility, detail, weekHours }: Props) {
  const cards: ComponentProps<typeof SummaryCard>[] = [];

  if (totalDoctors != null) {
    cards.push({ icon: '👨‍⚕️', label: '의료진', value: `의사 ${totalDoctors}명` });
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
      cards.push({
        icon: '🚑', label: '응급실',
        value: hasEr ? '운영' : '미운영',
        sub: detail.erDayOpen === 'Y' && detail.erNightOpen === 'Y' ? '24시간' : undefined,
      });
    }
    if (detail.parkingCapacity != null) {
      cards.push({
        icon: '🚗', label: '주차', value: `${detail.parkingCapacity}대`,
        sub: detail.parkingFee === 'Y' ? '유료' : detail.parkingFee === 'N' ? '무료' : undefined,
      });
    }
  }

  // 시작·종료가 모두 유효하고 앞뒤가 맞을 때만 값이 있다(모순 값으로 오늘 진료시간을 안내하지 않는다).
  const timeStr = weekHours?.[new Date().getDay()] ?? null;
  if (timeStr) {
    cards.push({ icon: '🕐', label: '오늘 진료', value: timeStr });
  }

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(c => <SummaryCard key={c.label} {...c} />)}
    </div>
  );
}
