# 아파트 상세 페이지 — end-to-end 구현 예시 (배선 참조)

> 목적: 06(프로즈)·07/08(JSON-LD)·레지스트리가 **실제 Next.js 페이지 하나에서 어떻게 연결되는지** 보여주는 참조 구현.
> 이 1개(아파트)를 복제하면 나머지 15개 카테고리는 레지스트리 키만 바꿔 동일 패턴으로 적용된다.
> imjangon은 **SSR(App Router/RSC) 확인됨** → 아래 코드는 모두 서버 컴포넌트에서 실행되어 초기 HTML에 포함된다.

---

## 0. 데이터 흐름 (한눈에)

```
서버 컴포넌트 page.tsx
  1) fetch 상세데이터 detail  (기존 로직 그대로)
  2) fetch/load 벤치마크 bench (지역·생활권 사전집계)
  3) buildAptNarrative(detail, bench)  → 해석 프로즈 (06)
  4) buildJsonLd('apt', {...})         → 출처 스키마 (08 범용 빌더)
  5) shouldIndex(modulesFired)         → index / noindex 결정 (08 §3)
  ────────────────────────────────────────────
  렌더: <ScriptLD/> + <해석 단락/> + [기존 표·차트·지도·목록 그대로]
```

핵심: **기존 UI는 전혀 안 바뀐다.** ①"한눈에 보기" 단락 1개 추가, ②`<head>`용 JSON-LD 교체/보강, ③얇으면 noindex — 이 3가지만 얹는다.

---

## 1. 아파트 인사이트 엔진 (프로즈 · 06 패턴의 apt 버전)

```ts
// lib/insights/apt.ts
type Deal = { date: string; type: '매매'|'전세'|'월세'; priceEok: number; areaM2: number; floor?: number };
type AptDetail = {
  name: string; url: string; region: string; sido: string;
  builtYear?: number; households?: number;
  deals: Deal[];                       // 최근 실거래(신고분)
  nearestStation?: { line: string; name: string; walkMin: number; distanceKm: number };
  infra500m?: { cafe?: number; conv?: number; hospital?: number; mart?: number };
  peer?: { medianSaleEok?: number; sampleN?: number };  // 생활권 벤치마크(사전집계)
};
type Insight = { key: string; weight: number; text: string };

const won = (eok: number) => `${eok}억`;
const q = (d: Date) => `${d.getFullYear()}-${Math.floor(d.getMonth()/3)+1}Q`;

// T: 최근 거래 추세 — '표 재서술'이 아니라 건수/방향을 판단
function tTrend(d: AptDetail): Insight | null {
  const sales = d.deals.filter(x => x.type === '매매');
  if (sales.length < 2) return null;
  const sorted = [...sales].sort((a,b)=>a.date.localeCompare(b.date));
  const first = sorted[0].priceEok, last = sorted[sorted.length-1].priceEok;
  const diff = Math.round(((last-first)/first)*100);
  const dir = diff >= 3 ? `직전 대비 약 ${diff}% 상승` : diff <= -3 ? `직전 대비 약 ${Math.abs(diff)}% 하락` : '큰 변동 없이 보합';
  return { key:'trend', weight:10,
    text: `최근 매매 ${sales.length}건이 신고됐고 실거래가는 ${dir} 흐름입니다(최근 ${won(last)}).` };
}

// P: 생활권 대비 가격 위치
function pPeer(d: AptDetail): Insight | null {
  const sales = d.deals.filter(x=>x.type==='매매');
  if (!sales.length || !d.peer?.medianSaleEok || (d.peer.sampleN ?? 0) < 5) return null;
  const latest = sales.sort((a,b)=>b.date.localeCompare(a.date))[0].priceEok;
  const diff = Math.round(((latest - d.peer.medianSaleEok)/d.peer.medianSaleEok)*100);
  const judge = diff >= 15 ? `생활권(${d.region}) 중위가보다 뚜렷하게 높은 상위 가격대`
    : diff >= 5 ? `생활권 중위가를 웃도는 수준`
    : diff > -5 ? `생활권 중위가와 비슷한 수준`
    : `생활권 중위가보다 낮아 상대적으로 진입 부담이 적은 편`;
  return { key:'peer', weight:9,
    text: `최근 실거래 ${won(latest)}은 ${judge}입니다(생활권 중위 ${won(d.peer.medianSaleEok)}).` };
}

// A: 접근성
function aAccess(d: AptDetail): Insight | null {
  const s = d.nearestStation, i = d.infra500m;
  const seg: string[] = [];
  if (s) seg.push(`${s.line} ${s.name} 도보 약 ${s.walkMin}분(${s.distanceKm}km)`);
  const infra = i ? [i.cafe&&`카페 ${i.cafe}곳`, i.conv&&`편의점 ${i.conv}곳`, i.hospital&&`병원 ${i.hospital}곳`, i.mart&&`마트 ${i.mart}곳`].filter(Boolean) : [];
  if (infra.length >= 2) seg.push(`반경 500m ${infra.join('·')}`);
  if (!seg.length) return null;
  const dense = infra.length >= 3 ? '생활 편의가 잘 갖춰진 입지' : '기본 생활 인프라를 갖춘 입지';
  return { key:'access', weight:6, text: `${seg.join(', ')} 등 ${dense}입니다.` };
}

// 규모·연식(맥락 보조)
function bScale(d: AptDetail): Insight | null {
  const parts: string[] = [];
  if (d.builtYear) parts.push(`${d.builtYear}년 준공`);
  if (d.households) parts.push(`${d.households.toLocaleString()}세대`);
  if (parts.length < 1) return null;
  return { key:'scale', weight:4, text: `${parts.join(' · ')} 단지입니다.` };
}

export function buildAptNarrative(d: AptDetail): { text: string; fired: string[] } | null {
  const mods = [bScale, tTrend, pPeer, aAccess].map(fn=>fn(d)).filter(Boolean) as Insight[];
  // 가드: 최소 3모듈 & 추세(T) 또는 또래(P) 중 하나 필수 → 미달이면 서술 생략(noindex 후보)
  if (mods.length < 3 || !mods.some(m => m.key==='trend' || m.key==='peer')) return null;
  const ordered = mods.sort((a,b)=>b.weight-a.weight);
  return { text: `${d.name}은(는) ${ordered.map(m=>m.text).join(' ')}`, fired: ordered.map(m=>m.key) };
}
```

---

## 2. 페이지 조립 — `page.tsx` (서버 컴포넌트, SSR)

```tsx
// app/apt/[id]/page.tsx
import type { Metadata } from 'next';
import { getAptDetail, getAptBenchmark } from '@/lib/data/apt';
import { buildAptNarrative } from '@/lib/insights/apt';
import { buildJsonLd } from '@/lib/jsonld/build';

// ── noindex 판정 (08 §3): 서술이 생성됐고 데이터가 충분할 때만 index
function decideIndex(fired: string[] | undefined) {
  return !!fired && fired.length >= 3;
}

export async function generateMetadata({ params }): Promise<Metadata> {
  const detail = await getAptDetail(params.id);
  const bench  = await getAptBenchmark(detail.region);
  const narr   = buildAptNarrative({ ...detail, peer: bench });
  const indexable = decideIndex(narr?.fired);
  return {
    title: `${detail.name} 실거래가·시세 | 임장ON`,
    description: narr?.text?.slice(0, 150)
      ?? `${detail.name}(${detail.region}) 아파트 실거래가·시세와 주변 생활권 정보.`,
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true }, // ← 얇으면 noindex
    alternates: { canonical: detail.url },
  };
}

export default async function AptDetailPage({ params }) {
  const detail = await getAptDetail(params.id);
  const bench  = await getAptBenchmark(detail.region);        // 사전집계 벤치마크
  const narr   = buildAptNarrative({ ...detail, peer: bench }); // 해석 프로즈(06)

  // 출처·신선도 JSON-LD (08 범용 빌더 + 레지스트리 'apt')
  const jsonLd = buildJsonLd('apt', {
    url: detail.url, name: detail.name,
    lat: detail.lat, lng: detail.lng,
    address: { region: detail.sido, locality: detail.region, street: detail.street },
    dateModified: detail.dataModified,          // 공공데이터 실제 기준일과 동기화
    ogImage: detail.ogImage,
    props: [
      detail.builtYear   && { name: '준공년도', value: detail.builtYear },
      detail.households   && { name: '세대수',  value: detail.households, unit: '세대' },
      detail.latestSaleEok&& { name: '최근 매매가', value: `${detail.latestSaleEok}억` },
      detail.latestJeonseEok && { name: '최근 전세가', value: `${detail.latestJeonseEok}억` },
    ].filter(Boolean),
  });

  return (
    <>
      {/* 1) JSON-LD — SSR로 초기 HTML에 포함 (imjangon 기존 방식 그대로) */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <h1>{detail.name}</h1>

      {/* 2) 해석 프로즈 — 없으면 렌더 안 함(=noindex와 짝) */}
      {narr && (
        <section aria-label="한눈에 보기" className="prose">
          <h2>한눈에 보기</h2>
          <p>{narr.text}</p>
        </section>
      )}

      {/* 3) 기존 UI 전부 그대로 — 실거래 표·시세 차트·지도·주변 인프라 목록 */}
      {/* <AptDealTable ... /> <PriceChart ... /> <Map ... /> <NearbyInfra ... /> */}
    </>
  );
}
```

**배선 포인트 3가지**
1. **description을 프로즈 앞부분으로** 채우면 페이지별 meta도 자동으로 고유해진다(중복 description 방지).
2. **narr가 null이면** → 프로즈 섹션 미렌더 + `robots: noindex`가 **동시에** 걸린다(얇은 페이지 자동 제외).
3. JSON-LD·프로즈 모두 **서버 컴포넌트에서 생성** → 초기 HTML 포함(크롤 보장). ayo(CSR)와 갈리는 지점.

---

## 3. 다른 카테고리로 복제하는 법

```
1. lib/insights/<cat>.ts  — build<Cat>Narrative() 작성
      (06/08의 모듈 매트릭스에서 해당 카테고리 스타 모듈만 조합)
2. buildJsonLd('<cat>', {...})  — 레지스트리 키만 교체(빌더·스키마·출처 자동)
3. decideIndex(fired)          — 동일 함수 재사용(minModules는 레지스트리에서)
4. page.tsx                    — 위 구조 그대로, 데이터 fetch·props만 카테고리에 맞게
```

→ 카테고리당 실질 작업 = **인사이트 모듈 1개 파일 + props 매핑**. 나머지는 공유.

---

## 4. 이 페이지 하나로 확인하는 수용 기준(AC)

- [ ] `view-source:`에 "한눈에 보기" 단락 텍스트와 JSON-LD가 **JS 없이** 보인다.
- [ ] 해석 문장에 **비교/추세/파생 판단**이 1개 이상(단순 표 재서술 아님).
- [ ] 데이터 부족 단지는 프로즈 없음 + `noindex`가 함께 걸린다.
- [ ] [Rich Results Test]로 `ApartmentComplex`/`Dataset` 스키마 통과.
- [ ] description이 페이지마다 다르다(프로즈 기반).
