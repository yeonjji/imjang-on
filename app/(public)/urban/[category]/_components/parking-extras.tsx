'use client';
import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ParkingRaw } from '@/lib/urban/adapters/parking';

const SPCMNT_THRESHOLD = 120;

export function ParkingExtras({ row }: { row: ParkingRaw }) {
  const [expanded, setExpanded] = useState(false);
  const hasBadges = row.pwdbsPpkZoneYn || !!row.enforceSe || !!row.feedingSe;
  const hasNote = (row.spcmnt ?? '').trim().length > 0;
  if (!hasBadges && !hasNote) return null;

  const spcmnt = row.spcmnt ?? '';
  const truncated = spcmnt.length > SPCMNT_THRESHOLD && !expanded
    ? spcmnt.slice(0, SPCMNT_THRESHOLD) + '…'
    : spcmnt;

  return (
    <Card id="extras">
      <h2 className="mb-3 text-lg font-bold text-[var(--color-blue-dark)]">부대정보</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {row.pwdbsPpkZoneYn && <Badge tone="orange">♿ 장애인전용 구획</Badge>}
        {row.enforceSe && <Badge tone="gray">단속 {row.enforceSe}</Badge>}
        {row.feedingSe && <Badge tone={row.feedingSe === '무료' ? 'green' : 'gray'}>{row.feedingSe}</Badge>}
      </div>
      {hasNote && (
        <div className="rounded-xl bg-[var(--color-soft)] p-4 text-sm text-[var(--color-text)]">
          <p className="mb-1 text-xs font-bold text-[var(--color-muted)]">특기사항</p>
          <p className="whitespace-pre-wrap">{truncated}</p>
          {spcmnt.length > SPCMNT_THRESHOLD && (
            <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs font-semibold text-[var(--color-blue)]">
              {expanded ? '접기' : '더 보기'}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
