'use client';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { StaticMapImage } from '@/components/ui/static-map';

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

  // 클라이언트 네비게이션 시 같은 src 스크립트는 재로드되지 않아 onLoad/onReady가
  // 늦거나 안 올 수 있다. SDK가 이미 떠 있으면 mount 즉시 준비 완료로 본다.
  useEffect(() => {
    if (window.naver?.maps) setReady(true);
  }, []);

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

    // 로드뷰(파노라마). submodules=panorama는 maps.js onLoad 이후 비동기로 붙으므로
    // Panorama가 함수가 될 때까지 폴링한 뒤 생성한다.
    let cancelled = false;
    let settled = false;
    let coverageTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (available: boolean) => {
      if (!settled && !cancelled) {
        settled = true;
        setRoadview(available);
      }
    };

    const initPanorama = () => {
      if (cancelled || !panoRef.current) return;
      try {
        const pano = new naver.maps.Panorama(panoRef.current, {
          position: center,
          pov: { pan: 0, tilt: 0, fov: 100 },
        });
        // 근처 파노라마가 로드되면 pano_changed/init이 발생한다. 일정 시간 내 없으면 미제공.
        naver.maps.Event.addListener(pano, 'pano_changed', () => settle(true));
        naver.maps.Event.addListener(pano, 'init', () => settle(true));
        coverageTimer = setTimeout(() => settle(false), 6000);
      } catch {
        settle(false);
      }
    };

    let waited = 0;
    const poll = setInterval(() => {
      if (cancelled) {
        clearInterval(poll);
        return;
      }
      if (typeof naver.maps.Panorama === 'function') {
        clearInterval(poll);
        initPanorama();
      } else if ((waited += 200) >= 6000) {
        clearInterval(poll);
        settle(false);
      }
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (coverageTimer) clearTimeout(coverageTimer);
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
        onReady={() => setReady(true)}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div
          className="relative overflow-hidden rounded-2xl border border-[var(--color-line)]"
          style={{ height }}
        >
          {/* SSR 정적 지도 poster: 검색 썸네일 후보로 마크업에 항상 존재한다.
              네이버 JS 지도가 로드되면 불투명 타일이 이 위를 덮고, 실패 시 그대로 fallback. */}
          <StaticMapImage
            lat={lat}
            lng={lng}
            name={name ?? '위치'}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
          <div ref={mapRef} className="relative h-full w-full" />
        </div>
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
