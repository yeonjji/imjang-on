import { mapImagePath } from '@/lib/seo/static-map';
import type { MapEntityKind } from '@/lib/seo/map-entity';

interface Props {
  kind: MapEntityKind;
  id: string | bigint;
  name: string;
  /** 표시 너비/높이(px). 이미지 고유 크기는 라우트가 600x400으로 고정한다. */
  width?: number;
  height?: number;
  /** 기본 스타일 대신 사용할 클래스 (예: LocationViewer poster용 absolute fill). */
  className?: string;
}

/**
 * 검색 썸네일 후보가 되는 실제 <img>. 인터랙티브 지도(LocationViewer)와 별개로,
 * JS 없이도 마크업에 존재한다. next/image 대신 plain <img>로 직접 URL을 노출한다.
 */
export function StaticMapImage({ kind, id, name, width = 600, height = 400, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mapImagePath(kind, id)}
      alt={`${name} 위치 지도`}
      width={width}
      height={height}
      className={className ?? 'mb-3 w-full rounded-2xl border border-[var(--color-line)] object-cover'}
    />
  );
}
