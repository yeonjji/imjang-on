/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typedRoutes: 모든 라우트 파일이 생성된 후 Phase 1D 후반에 재활성화 (현재는 미존재 라우트로 인한 typecheck 오류 회피)
  typedRoutes: false,
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
