# AdSense 운영 런북

## 1. GA4 연동 (운영자 수행)

코드는 이미 준비됨 — `app/layout.tsx`가 `NEXT_PUBLIC_GA_ID`가 있으면 `<GoogleAnalytics>`를 렌더한다.

1. [ ] GA4 속성 생성 → Measurement ID(`G-…`) 발급.
2. [ ] `.env.local`에 `NEXT_PUBLIC_GA_ID` **추가**(키가 없으면 신규 추가) + Vercel 환경변수에도 동일 키 설정.
3. [ ] 배포 후 GA4 **실시간 보고서**에서 페이지뷰 수집 확인.
4. [ ] GA4 데이터 설정 → "알려진 봇·스파이더 제외"(기본 on) 확인.
5. [ ] GA4 내부 트래픽 필터로 **운영자 자기 IP 제외**(자기 방문이 무효 신호를 오염시키지 않도록).
6. [ ] AdSense 콘솔에서 **GA4 속성 링크** → 페이지별 수익·노출·유입 출처 교차 분석.

## 2. 무효 트래픽 절대 금지 (계정 정지 직결)

- ❌ 자신의 광고 클릭 — 관심 있거나 URL 확인 목적이라도 금지.
- ❌ 가족·지인·방문자에게 클릭 요청·유도.
- ❌ 구매·교환·인센티브 트래픽(클릭 교환, 자동 서핑 등) 유입.
- ❌ 봇/자동화 수단으로 노출·클릭 인위적 증가.

## 3. 승인 전 체크리스트

각 항목을 현재 사이트 상태로 점검하고 PASS/FAIL 표시:

- [ ] 오리지널·실질 콘텐츠 충분.
- [ ] 개인정보처리방침 페이지 존재 — `/privacy` (PASS)
- [ ] 이용약관 페이지 존재 — `/terms` (PASS)
- [ ] 문의 경로 존재 — `/contact` (PASS)
- [ ] 명확한 네비게이션/사이트 구조.
- [ ] 광고 단위 삽입 시 `ad-placement-policy.md` 준수.

## 4. 무효활동 대응 (모니터링에서 이상 발견 시)

1. `invalid-traffic-monitoring.md`의 신호로 이상 확인(GA4 + AdSense 교차).
2. 원인 격리 — 유입 소스/페이지/기간 특정.
3. 제3자 무효활동(경쟁자 클릭폭격 등) 의심 시 Google **무효 클릭/트래픽 신고 채널**로 신고.
4. 계정 경고·정지 시 — AdSense 무효활동 보고서 확인 → 원인 제거 → **이의신청** 절차.

## 참고
- 무효 트래픽 방지 방법: https://support.google.com/adsense/answer/1112983?hl=ko
- 계정 해지로 이어지는 주요 위반: https://support.google.com/adsense/answer/2660562?hl=ko
- Google의 무효 트래픽 방지: https://support.google.com/adsense/answer/1348752?hl=ko
