import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes: 모든 라우트 파일이 생성된 후 Phase 1D 후반에 재활성화 (현재는 미존재 라우트로 인한 typecheck 오류 회피)
  typedRoutes: false,
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
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
