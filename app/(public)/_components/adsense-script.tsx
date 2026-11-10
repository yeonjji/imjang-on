'use client';

// AdSense는 콘텐츠 페이지에만 싣는다(opt-in) — (public) 레이아웃에서만 렌더한다.
// 루트 레이아웃에 두면 app/not-found.tsx·error.tsx·global-error.tsx 같은 빈 페이지에도 실려
// '가치 있는 인벤토리' 정책에 걸린다. next/script(preload만 남김) 대신 원본 태그 —
// React 19가 async 스크립트를 <head>로 올린다. 클라이언트 컴포넌트인 이유: 서버 컴포넌트면
// notFound() 응답의 RSC 페이로드에 이 URL이 문자열로 남는다.
export function AdSenseScript() {
  return (
    <script
      async
      src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7716793757405086"
      crossOrigin="anonymous"
    />
  );
}
