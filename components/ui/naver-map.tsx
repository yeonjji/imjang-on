'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    // 네이버 지도 SDK는 번들 타입이 없어 any로 둔다.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    naver?: any;
  }
}

interface Props {
  lat: number;
  lng: number;
  name?: string;
  height?: number;
}

export function NaverMap({ lat, lng, name, height = 260 }: Props) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !ref.current || !window.naver) return;
    const { naver } = window;
    const center = new naver.maps.LatLng(lat, lng);
    const map = new naver.maps.Map(ref.current, { center, zoom: 16 });
    new naver.maps.Marker({ position: center, map, title: name });
  }, [ready, lat, lng, name]);

  if (!clientId) {
    return (
      <div
        className="grid place-items-center rounded-2xl border border-[var(--color-line)] bg-[var(--color-soft)] text-sm text-[var(--color-muted)]"
        style={{ height }}
      >
        지도 준비 중 ({lat.toFixed(5)}, {lng.toFixed(5)})
      </div>
    );
  }

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div
        ref={ref}
        className="overflow-hidden rounded-2xl border border-[var(--color-line)]"
        style={{ height }}
      />
    </>
  );
}
