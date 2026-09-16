import Link from 'next/link';
import type { PropertyType } from '@prisma/client';
import { Card } from '@/components/ui/card';
import { SourceCaption } from '@/components/ui/source-caption';
import type { DongTransaction } from '@/lib/transaction/dong';
import { formatDongDate, formatDongPrice } from '@/lib/transaction/dong-format';

const SLUG: Record<string, string> = {
  APARTMENT: 'apt',
  OFFICETEL: 'officetel',
  MULTIPLEX: 'villa',
  ROW_HOUSE: 'villa',
};

const DEAL_LABEL: Record<string, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

/**
 * 같은 동네의 최근 거래. 아래 「주변 단지 가격 비교」(반경 2km·거리순)와 다른 섹션이라
 * 제목에 정렬 기준을 밝혀 성격 차이를 드러낸다(스펙 §2).
 *
 * 5건 고정이고 「더 보기」를 두지 않는다. /list는 건물 목록이라 거기로 보내면 탐색의
 * 성격이 바뀐다(스펙 §6.8).
 */
export function DongTransactionSection({
  items,
  dongLabel,
  propertyType,
  id,
}: {
  items: DongTransaction[];
  dongLabel: string;
  propertyType: PropertyType;
  id?: string;
}) {
  if (items.length === 0) return null;

  const unitWord = propertyType === 'APARTMENT' ? '다른 단지' : '다른 건물';

  return (
    <Card id={id}>
      <h2 className="text-xl font-bold text-[var(--color-blue-dark)]">{dongLabel} 최근 거래</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        같은 동네 {unitWord}의 계약일순 내역입니다
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--color-line)] text-left text-xs text-[var(--color-muted)]">
              <th scope="col" className="py-2 font-normal">계약일</th>
              <th scope="col" className="py-2 font-normal">건물명</th>
              <th scope="col" className="py-2 font-normal">전용면적</th>
              <th scope="col" className="py-2 font-normal">거래유형</th>
              <th scope="col" className="py-2 text-right font-normal">거래가</th>
              <th scope="col" className="py-2 text-right font-normal">층</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-[var(--color-line)] last:border-0">
                <td className="py-3 text-[var(--color-muted)]">{formatDongDate(t.contractDate)}</td>
                <td className="py-3">
                  <Link
                    href={`/${SLUG[t.propertyType] ?? 'apt'}/${t.propertyId}`}
                    className="font-semibold text-[var(--color-blue-dark)] hover:underline"
                  >
                    {t.propertyName}
                  </Link>
                </td>
                <td className="py-3 text-[var(--color-muted)]">{Math.round(t.exclusiveArea)}㎡</td>
                <td className="py-3 text-[var(--color-muted)]">{DEAL_LABEL[t.dealType]}</td>
                <td className="py-3 text-right font-bold text-[var(--color-blue-dark)]">
                  {formatDongPrice(t)}
                </td>
                <td className="py-3 text-right text-[var(--color-muted)]">
                  {t.floor != null ? `${t.floor}층` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SourceCaption ids={['molit-rtms']} />
    </Card>
  );
}
