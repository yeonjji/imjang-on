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

export function LocationViewer({ lat, lng, name, height = 280 }: Props) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
  const mapRef = useRef<HTMLDivElement>(null);
  const panoRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  // null=확인중, true=로드뷰 있음, false=로드뷰 없음
  const [roadview, setRoadview] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ready || !window.naver?.maps) return;
    const { naver } = window;
    const center = new naver.maps.LatLng(lat, lng);

    // 지도. 실패해도 페이지를 깨뜨리지 않는다.
    if (mapRef.current) {
      try {
        const map = new naver.maps.Map(mapRef.current, { center, zoom: 16 });
        new naver.maps.Marker({ position: center, map, title: name });
      } catch {
        // 지도 초기화 실패 시 빈 영역 유지.
      }
    }

    // 로드뷰(파노라마). 모듈 미로딩/커버리지 없음 등은 폴백으로 처리하고 throw하지 않는다.
    if (!panoRef.current || typeof naver.maps.Panorama !== 'function') {
      setRoadview(false);
      return;
    }
    let settled = false;
    const markAvailable = () => {
      if (!settled) {
        settled = true;
        setRoadview(true);
      }
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const pano = new naver.maps.Panorama(panoRef.current, {
        position: center,
        pov: { pan: 0, tilt: 0, fov: 100 },
      });
      // 근처 파노라마가 로드되면 pano_changed가 발생한다. 일정 시간 내 없으면 미제공으로 본다.
      naver.maps.Event.addListener(pano, 'pano_changed', markAvailable);
      naver.maps.Event.addListener(pano, 'init', markAvailable);
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          setRoadview(false);
        }
      }, 3000);
    } catch {
      setRoadview(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
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
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=panorama`}
        strategy="afterInteractive"
        onLoad={() => setReady(true)}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          ref={mapRef}
          className="overflow-hidden rounded-2xl border border-[var(--color-line)]"
          style={{ height }}
        />
        <div
          className="relative overflow-hidden rounded-2xl border border-[var(--color-line)]"
          style={{ height }}
        >
          <div ref={panoRef} className="h-full w-full" />
          {roadview === false && (
            <div className="absolute inset-0 grid place-items-center bg-[var(--color-soft)] text-sm text-[var(--color-muted)]">
              이 위치는 로드뷰를 제공하지 않습니다
            </div>
          )}
        </div>
      </div>
    </>
  );
}
