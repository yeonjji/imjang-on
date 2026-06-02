'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';

interface Region { sido: string; sigungu: string; sigunguCode: string; }
interface TypeCode { typeCode: string; typeName: string; }
interface Props {
  regions: Region[];
  typeCodes: TypeCode[];
  currentSigunguCode?: string;
  currentTypeCode?: string;
}

export function HospitalFilterPanel({ regions, typeCodes, currentSigunguCode, currentTypeCode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const sidos = [...new Set(regions.map(r => r.sido))].sort();
  const [selectedSido, setSelectedSido] = useState(() =>
    currentSigunguCode ? (regions.find(r => r.sigunguCode === currentSigunguCode)?.sido ?? '') : ''
  );
  const sigungus = selectedSido ? regions.filter(r => r.sido === selectedSido) : [];

  function navigate(sigunguCode: string, typeCode: string) {
    const p = new URLSearchParams(searchParams.toString());
    sigunguCode ? p.set('region', sigunguCode) : p.delete('region');
    typeCode ? p.set('type', typeCode) : p.delete('type');
    p.delete('page');
    startTransition(() => router.push(`/medical/hospital?${p.toString()}`));
  }

  const selectClass =
    'rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-blue)] focus:outline-none';

  return (
    <div className="flex flex-wrap gap-3">
      <select className={selectClass} value={selectedSido}
        onChange={e => { setSelectedSido(e.target.value); navigate('', currentTypeCode ?? ''); }}>
        <option value="">시도 전체</option>
        {sidos.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select className={selectClass} value={currentSigunguCode ?? ''} disabled={!selectedSido}
        onChange={e => navigate(e.target.value, currentTypeCode ?? '')}>
        <option value="">시군구 전체</option>
        {sigungus.map(r => <option key={r.sigunguCode} value={r.sigunguCode}>{r.sigungu}</option>)}
      </select>
      <select className={selectClass} value={currentTypeCode ?? ''}
        onChange={e => navigate(currentSigunguCode ?? '', e.target.value)}>
        <option value="">종류 전체</option>
        {typeCodes.map(t => <option key={t.typeCode} value={t.typeCode}>{t.typeName}</option>)}
      </select>
    </div>
  );
}
