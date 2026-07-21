import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 단일 노드 self-host: standalone 산출물(server.js)로 실행
  output: 'standalone',
  // typedRoutes: 모든 라우트 파일이 생성된 후 Phase 1D 후반에 재활성화 (현재는 미존재 라우트로 인한 typecheck 오류 회피)
  typedRoutes: false,
  // 동적 OG 이미지 라우트(서버리스 함수)에 Pretendard 폰트를 번들로 포함.
  // 미포함 시 loadOgFonts의 process.cwd() readFile이 런타임에 ENOENT → 500.
  // (파라미터 없는 루트 /opengraph-image는 정적 생성되어 영향 없었음)
  outputFileTracingIncludes: {
    '**/opengraph-image': ['./lib/seo/fonts/Pretendard-Bold.otf'],
    '**/thumbnail': ['./lib/seo/fonts/Pretendard-Bold.otf'],
  },
  images: {
    remotePatterns: [],
  },
  async redirects() {
    return [
      {
        source: '/amenity/:category/regions',
        destination: '/amenity/:category',
        permanent: true,
      },
      // ⚠️ '/amenity/:category/:sigunguCode(\\d{5})' → LIST redirect 룰은
      // detail id 일부(5자리 BigInt: 19290, 54012, 54589 등)와 패턴 충돌해
      // detail이 LIST로 잘못 308 redirect됨 → 제거.
      // 옛 시군구+id 형태 URL(예: /amenity/conv/11710/54589)은 아래 룰로 detail로 정리.
      {
        source: '/amenity/:category/:sigunguCode(\\d{5})/:id(\\d+)',
        destination: '/amenity/:category/:id',
        permanent: true,
      },
      // /region 서브트리 제거(thin-content) — 실콘텐츠 목록으로 308 승계.
      // 시군구 코드는 parseListParams가 ?region=→sigunguCode로 매핑해 필터 착지.
      {
        source: '/region',
        destination: '/list',
        permanent: true,
      },
      {
        source: '/region/:code',
        destination: '/list?region=:code',
        permanent: true,
      },
      // bare 카테고리 경로(index page.tsx 없음)는 대표 하위 카테고리로 308 승계.
      // 링크·sitemap엔 없지만 URL 절단 접근 시 소프트 404 방지.
      {
        source: '/medical',
        destination: '/medical/hospital',
        permanent: true,
      },
      {
        source: '/amenity',
        destination: '/amenity/convenience',
        permanent: true,
      },
      {
        source: '/urban',
        destination: '/urban/parking',
        permanent: true,
      },
      // /life 생활편의 허브 제거 — 각 그룹 대표 리스트로 301 승계.
      {
        source: '/life',
        destination: '/school',
        permanent: true,
      },
      {
        source: '/life/education',
        destination: '/school',
        permanent: true,
      },
      {
        source: '/life/medical',
        destination: '/medical/hospital',
        permanent: true,
      },
      {
        source: '/life/amenity',
        destination: '/amenity/convenience',
        permanent: true,
      },
      {
        source: '/life/urban',
        destination: '/urban/parking',
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // 소스맵 업로드: Vercel 프로덕션 + self-host(VERCEL_ENV 미설정)에서만. Vercel 프리뷰는 제외(빌드시간·비용).
  authToken: process.env.VERCEL_ENV === 'preview' ? undefined : process.env.SENTRY_AUTH_TOKEN,
});
