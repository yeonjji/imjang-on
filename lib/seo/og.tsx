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

/** OG 이미지 공통 레이아웃. satori 제약상 flex/명시 스타일만 사용. */
export function OgFrame({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        backgroundColor: '#1e3a8a',
        color: '#ffffff',
        fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, opacity: 0.85 }}>임장ON</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 64, lineHeight: 1.2 }}>{title}</div>
        {subtitle ? (
          <div style={{ display: 'flex', fontSize: 36, marginTop: 16, opacity: 0.9 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
      <div style={{ display: 'flex', fontSize: 28, opacity: 0.7 }}>
        공공데이터 부동산 실거래가
      </div>
    </div>
  );
}
