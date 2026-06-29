'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { HospitalTabDiagnosis } from './hospital-tab-diagnosis';
import { HospitalTabFacility } from './hospital-tab-facility';
import { HospitalTabOperation } from './hospital-tab-operation';
import type { HospitalWithRelations } from '@/lib/hospital';

type TabKey = 'diagnosis' | 'facility' | 'operation';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'diagnosis', label: '🩺 진료정보' },
  { key: 'facility', label: '🏥 시설·장비' },
  { key: 'operation', label: '🕐 운영·교통' },
];

interface Props { hospital: HospitalWithRelations; }

export function HospitalTabs({ hospital }: Props) {
  const [active, setActive] = useState<TabKey>('diagnosis');
  return (
    <Card>
      <div className="mb-4 flex gap-1 border-b border-[var(--color-line)]">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
              active === t.key
                ? 'border-[var(--color-blue)] text-[var(--color-blue)]'
                : 'border-transparent text-[var(--color-muted)] hover:text-[var(--color-blue-dark)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div hidden={active !== 'diagnosis'}>
        <HospitalTabDiagnosis
          depts={hospital.depts}
          staff={hospital.staff}
          specialties={hospital.specialties}
          specialTreatments={hospital.specialTreatments}
          nursingGrades={hospital.nursingGrades}
        />
      </div>
      <div hidden={active !== 'facility'}>
        <HospitalTabFacility
          facility={hospital.facility}
          equipment={hospital.equipment}
          mealSurcharges={hospital.mealSurcharges}
        />
      </div>
      <div hidden={active !== 'operation'}>
        <HospitalTabOperation detail={hospital.detail} transits={hospital.transits} />
      </div>
    </Card>
  );
}
