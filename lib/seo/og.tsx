import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

export async function loadOgFonts() {
  const data = await readFile(join(process.cwd(), 'lib/seo/fonts/Pretendard-Bold.otf'));
  return [{ name: 'Pretendard', data, weight: 700 as const, style: 'normal' as const }];
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
        backgroundColor: '#0b3d91',
        color: '#ffffff',
        fontFamily: 'Pretendard',
      }}
    >
      <div style={{ display: 'flex', fontSize: 40, opacity: 0.85 }}>임장온</div>
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
