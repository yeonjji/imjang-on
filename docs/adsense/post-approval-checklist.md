# AdSense 승인 후 처리 체크리스트

> 작성일: 2026-06-22
> 승인 전에는 할 수 없는 항목들 — 승인 나면 순서대로 처리

## 🔴 즉시 (광고 유닛 활성화 전 선결)

- [ ] **EEA/UK/CH 동의 관리(CMP) 활성화**
  - AdSense 콘솔 → 개인정보보호 및 메시지 → 유럽 규정 메시지(Funding Choices) 켜기
  - 코드 변경 없음, 콘솔 클릭만으로 완료
  - 이유: 미적용 시 EEA 트래픽에 광고 차단 + 정책 위반 제재 위험

- [ ] **Google 계정 2단계 인증 확인**
  - myaccount.google.com → 보안 → 2단계 인증
  - passkey 또는 하드웨어 보안키 권장 (SMS 지양)
  - 이유: 계정 탈취 = 수익 탈취 + 계정 밴 직결

## 🟡 광고 유닛 생성 시 동반 적용

- [ ] **광고 유닛 env 게이팅**
  - `NEXT_PUBLIC_ADSENSE_ENABLED=true` env를 prod(Vercel)에만 설정
  - localhost / Vercel preview / E2E 환경에서는 광고 미로드
  - 이유: 자가 클릭 사고 방지 (정책 위반)

- [ ] **ads.txt 'Authorized' 상태 확인**
  - `curl -I https://imjangon.co.kr/ads.txt` → 200 + text/plain 확인
  - AdSense 콘솔 → 사이트 → 'Authorized' 상태 확인

- [ ] **GA4 ↔ AdSense 연결 + 내부 IP 필터**
  - GA4 → 관리 → Google 제품 링크 → AdSense
  - GA4 → 데이터 스트림 → 내부 트래픽 필터 설정

## 🟢 이후 (권장)

- [ ] `app/(public)/privacy/page.tsx`에 `aboutads.info/choices` opt-out 링크 추가
- [ ] `next.config.mjs` headers()에 HSTS + baseline 보안 헤더 추가
  ```
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  ```
- [ ] CSP (nonce 기반 strict) — Report-Only로 며칠 선행 롤아웃 후 전환
  - ⚠️ `frame-src 'self'`/`'none'` 절대 금지 → 광고 iframe 차단
  - ⚠️ `COEP: require-corp` + `COOP: same-origin` 금지 → Google 광고 리소스 차단

## 참고

- 감사 보고서 전문: 2026-06-22 Claude Code 워크플로우 분석
- AdSense EU CMP 정책: https://support.google.com/adsense/answer/13554116
- AdSense CSP 가이드: https://support.google.com/adsense/answer/16283098
