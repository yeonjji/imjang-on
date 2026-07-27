import React from 'react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

// 동적 OG 라우트는 Vercel 서버리스 함수로 실행되며, 이 폰트 파일이 함수 번들에
// 포함되어야 한다. process.cwd() 경로는 번들러가 자동 추적하지 못하므로
// next.config.mjs의 outputFileTracingIncludes로 명시적으로 포함시킨다.
async function readFontsFromDisk() {
  const data = await readFile(join(process.cwd(), 'lib/seo/fonts/Pretendard-Bold.otf'));
  return [{ name: 'Pretendard', data, weight: 700 as const, style: 'normal' as const }];
}

// 웜(warm) 인스턴스에서 1.58MB 폰트를 OG 인보케이션마다 다시 읽지 않도록 모듈 스코프에 1회 메모이즈.
let fontsPromise: ReturnType<typeof readFontsFromDisk> | null = null;

export function loadOgFonts() {
  fontsPromise ??= readFontsFromDisk();
  return fontsPromise;
}

/**
 * 지도 없는 페이지(홈)용 브랜드 카드. satori 제약상 flex/명시 스타일만 사용.
 * 네이버는 1200x630을 가로로 크롭해 정사각으로 보여주므로, 중앙에서 벗어난
 * 텍스트는 잘려 나가 배경색만 남는다. 그래서 전부 중앙정렬이다.
 */
export function OgFrame({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 72,
        backgroundColor: '#1e3a8a',
        color: '#ffffff',
        fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, opacity: 0.85 }}>임장ON</div>
      <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.2, marginTop: 24, textAlign: 'center' }}>
        {title}
      </div>
      {subtitle ? (
        <div style={{ display: 'flex', fontSize: 36, marginTop: 16, opacity: 0.9 }}>{subtitle}</div>
      ) : null}
      <div style={{ display: 'flex', fontSize: 28, marginTop: 32, opacity: 0.7 }}>
        공공데이터 부동산 실거래가
      </div>
    </div>
  );
}

/**
 * 지도 위에 캡션 바를 얹은 OG 카드. 지도는 data URI로 넘어온다(원격 URL fetch 없음).
 * 캡션이 중앙정렬인 이유는 OgFrame과 같다 — 정사각 크롭 후에도 남아야 한다.
 */
export function OgMapFrame({
  mapDataUri,
  title,
  subtitle,
}: {
  mapDataUri: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        fontFamily: 'Pretendard',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={mapDataUri}
        alt=""
        width={OG_SIZE.width}
        height={OG_SIZE.height}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '28px 40px',
          backgroundColor: 'rgba(15,23,42,0.78)',
        }}
      >
        <div style={{ display: 'flex', fontSize: 54, color: '#ffffff' }}>{title}</div>
        <div style={{ display: 'flex', fontSize: 30, marginTop: 10, color: 'rgba(255,255,255,0.85)' }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
