import { sidoPrefix } from '@/lib/region';

export interface ResolvedRegionScope {
  /** regionTags 중 실제 시도(단축명)만. 비어 있으면 전국. */
  specificSidos: string[];
  /** 헤더 라벨. 예: '강원', '경남·울산', '서울 외', '전국'. */
  label: string;
}

const MAX_LABEL_SIDOS = 2;

export function resolveLoanRegionScope(regionTags: string[]): ResolvedRegionScope {
  const specificSidos = regionTags.filter((t) => sidoPrefix(t) !== undefined);
  const label =
    specificSidos.length === 0
      ? '전국'
      : specificSidos.length > MAX_LABEL_SIDOS
        ? `${specificSidos[0]} 외`
        : specificSidos.join('·');
  return { specificSidos, label };
}
