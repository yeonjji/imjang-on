import { staticMapPath } from '@/lib/seo/static-map';

interface Props {
  lat: number;
  lng: number;
  name: string;
  /** 표시 너비/높이(px). 기본 600x400. */
  width?: number;
  height?: number;
}

/**
 * 검색 썸네일 후보가 되는 실제 <img>. 인터랙티브 지도(LocationViewer)와 별개로,
 * JS 없이도 마크업에 존재한다. next/image 대신 plain <img>로 직접 URL을 노출한다.
 */
export function StaticMapImage({ lat, lng, name, width = 600, height = 400 }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={staticMapPath({ lat, lng, w: width, h: height })}
      alt={`${name} 위치 지도`}
      width={width}
      height={height}
      className="mb-3 w-full rounded-2xl border border-[var(--color-line)] object-cover"
    />
  );
}
