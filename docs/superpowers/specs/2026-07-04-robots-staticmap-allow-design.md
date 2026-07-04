# `/api/staticmap` robots 예외 허용 — 설계

- **작성일:** 2026-07-04
- **상태:** 승인됨 (구현 대기)
- **범위:** 소형 변경 (robots.ts 1줄 + 회귀 테스트 1개)

## 배경 / 문제

네이버 서치어드바이저 "robots.txt에 의해 수집 차단됨" 진단 리포트에 **2,000건이 전부 `/api/staticmap?lat=…&lng=…&w=…&h=…&level=…` 이미지**로 잡힌다 (다른 경로 0건).

원인은 의도된 동작이다. `app/robots.ts`가 `Disallow: /api/`로 `/api/` 전체를 막고 → Yeti가 상세페이지에서 이 이미지 참조를 발견 → 크롤 시도 → robots에 막힘 → "수집 차단" 목록에 기록. robots를 정상적으로 지키고 있다는 신호이지 에러가 아니다.

그러나 `/api/staticmap`은 단순 장식 썸네일이 아니다. `lib/seo/static-map.ts`의 `staticMapUrl()`이 **8개 상세페이지 타입의 JSON-LD `image`(대표 이미지)로 재사용**되고(`apt`·`officetel`·`villa`·`urban`·`childcare`·`medical/pharmacy`·`medical/hospital`·`school`), `staticMapPath()`는 `components/ui/static-map.tsx`의 `<img src>`로도 쓰인다. 즉 **검색엔진이 대표 이미지로 봐줬으면 하는 리소스를 robots로 스스로 막고 있는 모순**이다.

### 실질적 손해

- 네이버 검색결과/리치결과에서 이 페이지들의 **썸네일이 수집 불가**해 노출되지 않을 수 있음 (CTR 손해). 랭킹 자체가 떨어지는 문제는 아님.
- 진단 리포트에 2,000+건 노이즈가 쌓여 **실제 문제를 가림**. 상세페이지가 늘수록 계속 증가.

## 목표 / 비목표

**목표**
- `/api/staticmap` 지도 이미지를 검색엔진이 수집할 수 있게 열어, 대표 이미지 활용 + 리포트 노이즈 제거.
- `/api/`의 나머지 데이터 엔드포인트는 계속 차단 유지.
- robots 규칙 회귀를 막는 테스트 확보.

**비목표**
- 다른 `/api/*` 라우트 노출 (health·search·regions·revalidate·list·subway/search·subscribe-soon는 계속 차단).
- OG 이미지 관련 변경 (Next `opengraph-image.tsx` 컨벤션으로 `/apt/[id]/opengraph-image` 등 페이지 경로에 있어 이미 `Allow: /apt/` 하위 → 영향 없음).
- 지금 시점에 폴백(route 이전)을 구현하는 것 (아래 "폴백"은 문서화만).

## 결정: `robots.ts`의 `allow` 배열에 `/api/staticmap` 추가

`app/robots.ts`의 `allow` 상수에 `/api/staticmap` 한 항목을 추가한다. `userAgent: '*'`와 `userAgent: 'Yeti'` 두 룰이 같은 `allow` 변수를 공유하므로 한 번 추가로 둘 다 적용된다.

기존 한 줄 배열 형식을 유지하고, 예외의 이유만 위에 주석으로 남긴다(diff 최소화):

```ts
// '/api/staticmap'는 JSON-LD 대표 이미지/썸네일로 쓰여 검색 수집이 필요하므로 /api/ 차단에서 예외.
const allow = ['/', '/apt/', '/officetel/', '/villa/', '/api/staticmap', ...(isBoardPublic() ? ['/board/'] : [])];
```

`disallow: ['/list', '/api/', '/admin']`는 그대로 둔다.

### 대안과 기각 이유

- **그대로 둔다 (무해론):** 차단은 정상 동작이고 랭킹 문제는 아니지만, 대표 이미지 수집 불가 + 리포트 노이즈가 남는다. 개선 요청의 취지에 부합하지 않아 기각.
- **route를 `/api` 밖으로 이전 (`/staticmap`):** Yeti의 Allow 지원 여부와 무관하게 100% 동작하는 유일한 방법이나, route 이동 + `staticMapPath`·`components/ui/static-map.tsx`·9곳 JSON-LD 참조 갱신으로 변경 범위가 크다. Allow 예외가 실측에서 실패할 때만 쓰는 **폴백**으로 문서화(아래).

## 왜 이 변경으로 충분한가 (검증 완료)

1. **Longest-match 우선순위 (RFC 9309 §2.2.2 + Google robots 스펙):** 매칭되는 규칙 중 경로 옥텟이 가장 긴 규칙이 이긴다. `/api/staticmap`(14) > `/api/`(5) → staticmap은 허용, 나머지 `/api/`는 계속 차단. Allow/Disallow 동률일 때는 Allow가 이긴다.
2. **쿼리스트링 매칭:** 앵커·와일드카드 없는 prefix 규칙은 쿼리스트링을 포함해 매칭된다. `/api/staticmap`은 `/api/staticmap?lat=37.5&lng=127.0`에 매칭 (Google 예시: `/fish` → `/fish.php?id=anything`).
3. **Allow-before-Disallow 하드닝 무료:** Next.js 15.5.18 `resolveRobots` serializer가 룰 그룹 내에서 **모든 `Allow:` 줄을 `Disallow:` 줄보다 먼저** 출력한다(배열 순서와 무관). longest-match를 안 지키고 first-match로 처리하는 크롤러에도 방어가 된다. 추가 코드 불필요.
4. **부작용 없음:** 다운사이드 시나리오(예: Yeti가 Allow를 무시)에서도 현상 유지일 뿐 악화는 없다. 스펙 준수 크롤러(Googlebot)는 즉시 이득을 본다.

### 남은 불확실성

Yeti의 robots.txt 알고리즘은 **공식 문서 미확인**(searchadvisor.naver.com 원문 확보 실패). "Allow는 구글봇 전용"이라는 한국 SEO 밈이 있으나 실측 근거는 없고 반증도 없다. 그래서 배포만으로 종결하지 않고 아래 **검증 게이트**를 설계에 포함한다.

## 검증 게이트 (배포 후, 결정적)

배포 후 **네이버 서치어드바이저 → 검증 → robots.txt** 도구에서 Yeti user-agent로 샘플 URL을 테스트한다:

```
/api/staticmap?lat=37.5&lng=127.0&w=600&h=400&level=16
```

- **"허용됨"** → 성공. 종료.
- **"차단됨"** → Yeti가 예외를 존중하지 않는 것. 아래 폴백으로 전환.

이 실측이 Yeti의 Allow 처리를 판별하는 유일한 확실한 방법이다.

## 폴백 (문서화만 — 지금 구현하지 않음)

검증 게이트가 "차단됨"으로 나올 때만 착수:

1. route를 `app/api/staticmap/route.ts` → `app/staticmap/route.ts`(= `/api` 밖)로 이전.
2. `lib/seo/static-map.ts`의 `staticMapPath()` 반환 경로를 `/staticmap?…`로 변경 (`staticMapUrl`은 자동 반영).
3. 참조 확인: `components/ui/static-map.tsx`(img), 9곳의 JSON-LD `image`는 `staticMapUrl`을 통하므로 자동 반영. 하드코딩된 `/api/staticmap` 문자열이 없는지 grep으로 확인.
4. robots.ts에서 `/api/staticmap` allow 항목 제거(더 이상 불필요), `Disallow: /api/`만 유지.
5. 기존 URL 캐시/색인 정리: `/api/staticmap`은 `Disallow: /api/`로 자연 소멸.

`/staticmap`은 어떤 Disallow에도 걸리지 않으므로 Yeti의 Allow 지원 여부와 무관하게 크롤 가능하다.

## 회귀 방지 테스트

현재 robots 테스트가 없다. `tests/lib/robots.test.ts`를 추가한다.

> ⚠️ 배치 위치 주의: `package.json`의 `test:unit`은 `vitest run tests/lib tests/ingest tests/components`로 **이 세 디렉토리만** 실행한다. `tests/app/`에 두면 CI에서 조용히 미실행된다. sitemap 테스트도 같은 이유로 `tests/lib`에 있다.

```ts
import { describe, it, expect } from 'vitest';
import robots from '@/app/robots';

describe('robots.txt', () => {
  const result = robots();
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];

  it('모든 룰에서 /api/staticmap 을 허용한다', () => {
    for (const rule of rules) {
      const allow = Array.isArray(rule.allow) ? rule.allow : [rule.allow];
      expect(allow).toContain('/api/staticmap');
    }
  });

  it('/api/ 전반은 계속 차단한다', () => {
    for (const rule of rules) {
      const disallow = Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow];
      expect(disallow).toContain('/api/');
    }
  });
});
```

`robots()`는 순수 함수이고 `isBoardPublic()`은 항상 `true`라 결정적이다.

## 받아들인 트레이드오프

Yeti·Googlebot이 이제 지도 이미지를 실제로 크롤 → **NCP Static Map 쿼터 일부 소모**. 다만:
- 크롤 대상은 색인된 상세페이지가 참조하는 좌표로 제한(유계).
- 좌표당 이미지는 upstream 30일(`UPSTREAM_REVALIDATE`) + CDN `s-maxage=2592000`로 캐시 → NCP 상류 호출은 좌표당 1회 수준.
- 실사용자 트래픽이 이미 대부분의 좌표를 생성하므로 크롤러가 추가하는 건 미방문 좌표의 꼬리뿐.

## 검증 체크리스트

1. `app/robots.ts`에 `/api/staticmap` allow 추가 → 검증: `tests/lib/robots.test.ts` 통과.
2. `pnpm build` 후 생성된 `/robots.txt`에 `Allow: /api/staticmap`가 `Disallow: /api/`보다 **앞줄**에 출력되는지 확인.
3. `pnpm lint` 0 경고/에러, `pnpm test:unit` 통과.
4. 배포 후 네이버 서치어드바이저 robots.txt 테스터(Yeti UA)에서 샘플 URL "허용됨" 확인 → 실패 시 폴백.

## 참고

- RFC 9309 (Robots Exclusion Protocol) §2.2 / §2.2.2 — https://www.rfc-editor.org/rfc/rfc9309.html
- Google robots.txt 스펙 — https://developers.google.com/search/docs/crawling-indexing/robots/robots_txt
- Next.js `resolveRobots` serializer — `node_modules/next/dist/.../metadata/resolve-route-data` (Allow를 Disallow보다 먼저 출력)
