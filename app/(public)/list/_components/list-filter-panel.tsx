'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';

export function ListFilterPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const type = searchParams.get('type') ?? 'all';
  const deal = searchParams.get('deal') ?? 'all';
  const price = searchParams.get('price') ?? null;
  const area = searchParams.get('area') ?? null;
  const sort = searchParams.get('sort') ?? 'recent';

  const hasActiveFilters =
    type !== 'all' || deal !== 'all' || !!price || !!area || sort !== 'recent';

  function updateParams(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    params.delete('page');
    router.push(`/list?${params.toString()}`);
  }

  function handleReset() {
    router.push('/list');
  }

  const priceLabel =
    deal === 'jeonse'
      ? '전세 보증금 기준'
      : deal === 'wolse'
        ? '월세 보증금 기준'
        : '매매가 기준';

  return (
    <div className="flex flex-col gap-6">
      {/* 주거유형 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">주거유형</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip
            active={type === 'all'}
            onClick={() => updateParams({ type: 'all' })}
          >
            전체
          </Chip>
          <Chip
            active={type === 'apt'}
            onClick={() => updateParams({ type: type === 'apt' ? 'all' : 'apt' })}
          >
            아파트
          </Chip>
          <Chip
            active={type === 'officetel'}
            onClick={() =>
              updateParams({ type: type === 'officetel' ? 'all' : 'officetel' })
            }
          >
            오피스텔
          </Chip>
          <Chip
            active={type === 'villa'}
            onClick={() => updateParams({ type: type === 'villa' ? 'all' : 'villa' })}
          >
            다세대
          </Chip>
        </div>
      </section>

      {/* 거래유형 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">거래유형</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip
            active={deal === 'all'}
            onClick={() => updateParams({ deal: 'all' })}
          >
            전체
          </Chip>
          <Chip
            active={deal === 'sale'}
            onClick={() => updateParams({ deal: deal === 'sale' ? 'all' : 'sale' })}
          >
            매매
          </Chip>
          <Chip
            active={deal === 'jeonse'}
            onClick={() =>
              updateParams({ deal: deal === 'jeonse' ? 'all' : 'jeonse' })
            }
          >
            전세
          </Chip>
          <Chip
            active={deal === 'wolse'}
            onClick={() => updateParams({ deal: deal === 'wolse' ? 'all' : 'wolse' })}
          >
            월세
          </Chip>
        </div>
      </section>

      {/* 가격대 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">
          가격대
          <span className="ml-1 text-xs text-[var(--color-muted)]">{priceLabel}</span>
        </h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip
            active={price === 'lt5'}
            onClick={() => updateParams({ price: price === 'lt5' ? null : 'lt5' })}
          >
            5억 이하
          </Chip>
          <Chip
            active={price === '5to10'}
            onClick={() =>
              updateParams({ price: price === '5to10' ? null : '5to10' })
            }
          >
            5~10억
          </Chip>
          <Chip
            active={price === '10to15'}
            onClick={() =>
              updateParams({ price: price === '10to15' ? null : '10to15' })
            }
          >
            10~15억
          </Chip>
          <Chip
            active={price === 'gt15'}
            onClick={() => updateParams({ price: price === 'gt15' ? null : 'gt15' })}
          >
            15억 이상
          </Chip>
        </div>
      </section>

      {/* 면적 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">면적</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip
            active={area === 'small'}
            onClick={() => updateParams({ area: area === 'small' ? null : 'small' })}
          >
            ~59㎡
          </Chip>
          <Chip
            active={area === 'medium'}
            onClick={() =>
              updateParams({ area: area === 'medium' ? null : 'medium' })
            }
          >
            60~84㎡
          </Chip>
          <Chip
            active={area === 'large'}
            onClick={() => updateParams({ area: area === 'large' ? null : 'large' })}
          >
            85~114㎡
          </Chip>
          <Chip
            active={area === 'xlarge'}
            onClick={() =>
              updateParams({ area: area === 'xlarge' ? null : 'xlarge' })
            }
          >
            115㎡~
          </Chip>
        </div>
      </section>

      {/* 정렬 */}
      <section>
        <h3 className="text-sm font-bold text-[var(--color-blue-dark)]">정렬</h3>
        <div className="flex flex-wrap gap-2 mt-2">
          <Chip
            active={sort === 'recent'}
            onClick={() => updateParams({ sort: 'recent' })}
          >
            최신거래순
          </Chip>
          <Chip
            active={sort === 'volume'}
            onClick={() => updateParams({ sort: 'volume' })}
          >
            거래많은순
          </Chip>
        </div>
      </section>

      {/* 초기화 버튼 */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={handleReset}>
          필터 초기화
        </Button>
      )}
    </div>
  );
}
