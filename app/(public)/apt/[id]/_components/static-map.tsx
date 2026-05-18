'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    kakao: any;
  }
}

export function StaticMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_KAKAO_JS_KEY) return;
    const script = document.createElement('script');
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${process.env.NEXT_PUBLIC_KAKAO_JS_KEY}&autoload=false`;
    script.async = true;
    script.onload = () => {
      window.kakao.maps.load(() => {
        if (!ref.current) return;
        const center = new window.kakao.maps.LatLng(lat, lng);
        const map = new window.kakao.maps.Map(ref.current, { center, level: 4 });
        new window.kakao.maps.Marker({ position: center, map, title: name });
      });
    };
    document.head.appendChild(script);
    return () => {
      script.remove();
    };
  }, [lat, lng, name]);

  return <div ref={ref} className="h-64 w-full rounded-2xl bg-[var(--color-line)]" />;
}
