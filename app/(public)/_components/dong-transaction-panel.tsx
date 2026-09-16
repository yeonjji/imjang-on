'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { DealType, PropertyType } from '@prisma/client';
import type { DongTransaction } from '@/lib/transaction/dong';
import type { DongOption } from '@/lib/dong-options';
import { formatDongMeta, formatDongPrice } from '@/lib/transaction/dong-format';
import { SourceCaption } from '@/components/ui/source-caption';

export interface SidoItem {
  code: string;
  sido: string;
  fullName: string;
}

export interface SigunguItem {
  code: string;
  sigungu: string;
  fullName: string;
  sigunguCode: string;
}

const PROPERTY_TYPES: { key: PropertyType; label: string }[] = [
  { key: 'APARTMENT', label: '아파트' },
  { key: 'OFFICETEL', label: '오피스텔' },
  { key: 'MULTIPLEX', label: '다세대' },
  { key: 'ROW_HOUSE', label: '연립' },
];

const DEAL_TABS: { key: DealType | 'ALL'; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'SALE', label: '매매' },
  { key: 'JEONSE', label: '전세' },
  { key: 'WOLSE', label: '월세' },
];

const DEAL_BADGE: Record<string, string> = {
  SALE: 'bg-[var(--color-sky-soft)] text-[var(--color-blue-dark)]',
  JEONSE: 'bg-[#fee2e2] text-[#b91c1c]',
  WOLSE: 'bg-[#fef3c7] text-[#b45309]',
};
const DEAL_LABEL: Record<string, string> = { SALE: '매매', JEONSE: '전세', WOLSE: '월세' };

const SLUG: Record<string, string> = {
  APARTMENT: 'apt', OFFICETEL: 'officetel', MULTIPLEX: 'villa', ROW_HOUSE: 'villa',
};

type Status = 'idle' | 'loading' | 'error';

/** 목록 아래에 무엇을 보여줄지. resolvePanelView가 순서대로 판정해 하나만 돌려준다. */
type PanelView =
  | 'loading'
  | 'sigungu-failed'
  | 'sigungu-empty'
  | 'dong-failed'
  | 'dong-empty'
  | 'tx-loading'
  | 'tx-error'
  | 'tx-empty'
  | 'results';

/** 시군구 목록의 첫 항목을 고른다(가나다순 정렬은 서버 응답이 이미 해 둔다). 목록이 비면 선택 없음. */
export function pickFirstSigungu(list: SigunguItem[]): SigunguItem | null {
  return list[0] ?? null;
}

/** 동 목록의 첫 항목을 고른다(가나다순은 readDongOptions가 이미 해 둔다). 목록이 비면 선택 없음. */
export function pickFirstDong(list: DongOption[]): DongOption | null {
  return list[0] ?? null;
}

/**
 * 동네 거래 조회 쿼리스트링을 만든다.
 *
 * 시군구·동이 아직 정해지지 않은 과도 상태 — 시도를 막 바꿔 하위 목록이 도착하기
 * 전, 혹은 시군구를 막 바꿔 동 목록이 도착하기 전 — 에는 null을 돌려줘 호출부가
 * 조회를 건너뛰게 한다. 그 상태로 조회하면 이전 지역의 결과가 잠깐 섞여 보인다.
 */
export function buildDongTransactionsQuery(params: {
  sigunguCode: string;
  umd: string;
  propertyType: PropertyType;
  deal: DealType | 'ALL';
}): string | null {
  if (!params.sigunguCode || !params.umd) return null;
  const qs = new URLSearchParams({
    sigunguCode: params.sigunguCode,
    umd: params.umd,
    propertyType: params.propertyType,
  });
  if (params.deal !== 'ALL') qs.set('dealType', params.deal);
  return qs.toString();
}

/**
 * 목록 아래에 무엇을 보여줄지 판정하는 순수 함수. 세 단계(시군구 목록 → 동 목록 →
 * 거래 목록) 각각 로딩/실패/빈 결과를 가질 수 있는데, 우선순위대로 하나만 고른다.
 *
 * 로딩 중인 단계가 있으면 무조건 스켈레톤이다(사용자에게 "아직 진행 중"이라고
 * 말해 줘야 한다). 로딩이 끝났는데 sigunguCode나 umd가 비어 있으면 그건 더 이상
 * "진행 중"이 아니라 "실패했거나 원래 빈 목록"이라는 안정적인 상태다 — 그 둘을
 * 구분해야 실패면 재시도를, 빈 목록이면 그냥 사실을 보여줄 수 있다.
 *
 * txStatus는 sigunguCode·umd가 둘 다 있을 때만 의미가 있다 — 그 전 단계에서
 * 걸러지므로 여기 도달했다는 건 이미 지역이 확정됐다는 뜻이다.
 */
export function resolvePanelView(params: {
  sigunguLoading: boolean;
  dongLoading: boolean;
  sigunguFailed: boolean;
  dongFailed: boolean;
  sigunguCode: string;
  umd: string;
  txStatus: Status;
  itemsCount: number;
}): PanelView {
  const { sigunguLoading, dongLoading, sigunguFailed, dongFailed, sigunguCode, umd, txStatus, itemsCount } = params;

  if (sigunguLoading || dongLoading) return 'loading';
  if (sigunguFailed) return 'sigungu-failed';
  if (!sigunguCode) return 'sigungu-empty';
  if (dongFailed) return 'dong-failed';
  if (!umd) return 'dong-empty';
  if (txStatus === 'loading') return 'tx-loading';
  // txStatus가 'error'면 items에 이전 조회의 결과가 남아 있어도(성공 경로에서만
  // items를 갱신하므로) 결과 목록이 아니라 에러 UI를 보여준다 — 그래야 이전 동의
  // 거래가 새 동 라벨 아래 뜨는 일이 없다.
  if (txStatus === 'error') return 'tx-error';
  if (itemsCount === 0) return 'tx-empty';
  return 'results';
}

/**
 * 홈 히어로 오른쪽의 동네 거래 패널.
 *
 * 지역은 시도 → 시군구 → 동 3단 캐스케이드다(스펙 §6.3). 시도·시군구는 `/api/regions`
 * (일반구 통합시는 `gu=1`로 구 단위 — 실거래가 적재 기준과 맞춘다), 동은 `/api/dongs`에서
 * 가져온다. 시도를 바꾸면 시군구·동을 모두 비우고, 새 목록이 도착하면 첫 항목을 자동
 * 선택한다 — 사용자가 매번 세 번 클릭해야 결과를 보는 일이 없게 한다. 시군구를 바로
 * 바꿔도 같은 규칙으로 동이 비워지고 다시 자동 선택된다.
 *
 * 시도의 초기 전체 목록은 마운트 시 조용히(로딩 표시 없이) 배경에서 채운다 — 서버가
 * 이미 내려준 현재 선택은 그대로 두고, 드롭다운의 나머지 선택지만 채우는 작업이라
 * 화면을 깜빡이게 할 이유가 없다.
 *
 * 좁은 폭이라 두 줄 압축 형태다. 상세의 표와 데이터·포맷은 공유하지만 배치는 다르다.
 * 0건이어도 패널이 사라지지 않는다 — 필터를 눌렀는데 없어지면 고장으로 읽힌다.
 *
 * 시도 드롭다운은 getSidoList()의 정적 17개 상수라 Region에 행이 없는 시도(광주·
 * 전남광주 등, lib/region.ts 참조)까지 항상 뜬다. 그런 시도를 고르면 /api/regions가
 * 빈 배열을 주거나 실패하고, sigunguCode가 끝내 비게 된다 — 로딩도 아니고 결과도
 * 아닌 이 안정 상태를 스켈레톤으로 보여주면 사용자가 갇힌다. 실패/빈 목록을
 * 구분해 명시적으로 보여주고, 위 select들은 항상 enabled로 둬 다른 시도·시군구를
 * 골라 빠져나올 수 있게 한다.
 */
export function DongTransactionPanel({
  initialSido,
  initialSigunguCode,
  initialSigunguName,
  initialUmd,
  initialDongs,
  initialItems,
  sidoList,
}: {
  initialSido: string;
  initialSigunguCode: string;
  initialSigunguName: string;
  initialUmd: string;
  initialDongs: DongOption[];
  initialItems: DongTransaction[];
  sidoList: SidoItem[];
}) {
  const [sido, setSido] = useState(initialSido);
  const [sigunguCode, setSigunguCode] = useState(initialSigunguCode);
  // 실제 목록이 도착하기 전에도 select가 현재 선택을 보여줄 수 있도록 1건으로 시드한다.
  const [sigunguList, setSigunguList] = useState<SigunguItem[]>([
    { code: initialSigunguCode, sigungu: initialSigunguName, fullName: '', sigunguCode: initialSigunguCode },
  ]);
  const [sigunguLoading, setSigunguLoading] = useState(false);
  const [sigunguFailed, setSigunguFailed] = useState(false);
  const [sidoRetryTick, setSidoRetryTick] = useState(0);

  const [umd, setUmd] = useState(initialUmd);
  const [dongs, setDongs] = useState<DongOption[]>(initialDongs);
  const [dongLoading, setDongLoading] = useState(false);
  const [dongFailed, setDongFailed] = useState(false);
  const [sigunguRetryTick, setSigunguRetryTick] = useState(0);

  const [propertyType, setPropertyType] = useState<PropertyType>('APARTMENT');
  const [deal, setDeal] = useState<DealType | 'ALL'>('ALL');
  const [items, setItems] = useState<DongTransaction[]>(initialItems);
  const [status, setStatus] = useState<Status>('idle');
  const [retryTick, setRetryTick] = useState(0);

  // 시도가 바뀌면 시군구 목록을 다시 가져온다. 마운트 시에도 한 번 실행되어 초기
  // 시도의 전체 목록을 채우지만, 그때는 서버가 이미 정해 준 시군구·동 선택을
  // 건드리지 않는다 — 재설정(비우기+첫 항목 자동 선택)은 사용자가 시도를 바꾼
  // 이후에만 한다. sidoRetryTick은 "지역 목록을 불러오지 못했습니다"의 다시
  // 시도 버튼이 올린다 — 같은 sido로 같은 fetch를 다시 보낸다.
  const sigunguSeq = useRef(0);
  const sigunguAbort = useRef<AbortController | null>(null);
  const firstSido = useRef(true);

  useEffect(() => {
    const isInitial = firstSido.current;
    firstSido.current = false;

    const mine = ++sigunguSeq.current;
    sigunguAbort.current?.abort();
    const ctl = new AbortController();
    sigunguAbort.current = ctl;
    if (!isInitial) {
      setSigunguLoading(true);
      setSigunguFailed(false);
      // 시군구·동을 둘 다 비운다. 이전 시군구의 동이 새 시도에 남아 있으면 안 된다.
      setSigunguCode('');
      setUmd('');
    }

    // gu=1: 일반구 통합시(수원·성남·고양 등)를 구 단위로. 실거래는 구 코드로
    // 적재되므로 /list와 같은 기준이어야 한다(스펙 §6.3).
    fetch(`/api/regions?sido=${encodeURIComponent(sido)}&gu=1`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((list: SigunguItem[]) => {
        if (mine !== sigunguSeq.current) return;
        setSigunguList(list);
        if (!isInitial) {
          setSigunguCode(pickFirstSigungu(list)?.sigunguCode ?? '');
          setSigunguLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || mine !== sigunguSeq.current) return;
        void e;
        if (!isInitial) {
          setSigunguLoading(false);
          setSigunguFailed(true);
        }
      });

    return () => ctl.abort();
  }, [sido, sidoRetryTick]);

  // 시군구가 바뀌면(직접 선택이든 시도 전환의 자동 선택이든) 동 목록을 다시 가져오고
  // 첫 항목을 고른다. 마운트 시에는 서버가 이미 내려준 initialDongs·initialUmd를 쓴다.
  // sigunguRetryTick은 "지역 목록을 불러오지 못했습니다"의 다시 시도 버튼이 올린다 —
  // 같은 sigunguCode로 같은 fetch를 다시 보낸다.
  const dongSeq = useRef(0);
  const dongAbort = useRef<AbortController | null>(null);
  const firstSigungu = useRef(true);

  useEffect(() => {
    if (firstSigungu.current) {
      firstSigungu.current = false;
      return;
    }
    if (!sigunguCode) {
      // 시도가 막 바뀌어 시군구가 아직 정해지지 않은 과도 상태. 이전 시군구의
      // 동이 남아 있으면 안 되므로 비운 채로 둔다. dongLoading도 같이 내린다 —
      // 이 effect가 새로 실행됐다는 건 React가 직전 fetch의 cleanup(abort)을
      // 이미 불렀다는 뜻인데, 그 fetch가 진행 중이었다면 catch가 abort를 보고
      // 조용히 빠져나가 dongLoading=true가 영영 고정될 수 있다.
      setDongs([]);
      setUmd('');
      setDongFailed(false);
      setDongLoading(false);
      return;
    }

    const mine = ++dongSeq.current;
    dongAbort.current?.abort();
    const ctl = new AbortController();
    dongAbort.current = ctl;
    setDongLoading(true);
    setDongFailed(false);
    setUmd('');

    fetch(`/api/dongs?sigunguCode=${encodeURIComponent(sigunguCode)}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((list: DongOption[]) => {
        if (mine !== dongSeq.current) return;
        setDongs(list);
        setUmd(pickFirstDong(list)?.umd ?? '');
        setDongLoading(false);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || mine !== dongSeq.current) return;
        void e;
        setDongLoading(false);
        setDongFailed(true);
      });

    return () => ctl.abort();
  }, [sigunguCode, sigunguRetryTick]);

  // 거래 목록 조회. 지역·유형을 빠르게 바꾸면 늦게 온 이전 응답이 최신 결과를
  // 덮을 수 있어 시퀀스로 최신 것만 반영하고 이전 요청은 취소한다. 시군구·동이
  // 캐스케이드 전환 중이라 비어 있으면(buildDongTransactionsQuery가 null) 조회하지 않는다.
  // retryTick은 조회 실패 UI의 다시 시도 버튼이 올린다 — 필터가 그대로라도 이
  // deps가 바뀌어야 effect가 다시 fetch를 보낸다("다시 시도"가 상태만 idle로
  // 되돌리고 재조회를 안 하면 이전 결과가 새 라벨 아래 그대로 남는다).
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const firstTx = useRef(true);

  useEffect(() => {
    if (firstTx.current) {
      // 서버가 그려 준 초기 결과를 그대로 쓴다. 마운트 직후 중복 조회를 하지 않는다.
      firstTx.current = false;
      return;
    }
    const query = buildDongTransactionsQuery({ sigunguCode, umd, propertyType, deal });
    if (query == null) return;

    const mine = ++seq.current;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStatus('loading');

    fetch(`/api/dong-transactions?${query}`, { signal: ctl.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((rows: DongTransaction[]) => {
        if (mine !== seq.current) return;
        setItems(rows);
        setStatus('idle');
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted || mine !== seq.current) return;
        void e;
        // 실패했는데 이전 조회의 결과를 items에 남겨 둘 이유가 없다 — 남아 있으면
        // 다음에 status가 idle로 돌아갈 때(다시 시도 등) 다른 동의 거래가 지금
        // 라벨 아래 뜬다.
        setItems([]);
        setStatus('error');
      });

    return () => ctl.abort();
  }, [sigunguCode, umd, propertyType, deal, retryTick]);

  // 실제로 진행 중인 fetch가 있을 때만 "로딩"이다. sigunguCode·umd가 비어 있는
  // 것 자체는 더 이상 cascading에 넣지 않는다 — 로딩이 끝났는데도 비어 있다면
  // 그건 실패했거나 원래 빈 목록이라는 안정 상태이지, 아직 진행 중인 상태가
  // 아니다. 그 구분은 resolvePanelView가 한다.
  const cascading = sigunguLoading || dongLoading;

  const view = resolvePanelView({
    sigunguLoading,
    dongLoading,
    sigunguFailed,
    dongFailed,
    sigunguCode,
    umd,
    txStatus: status,
    itemsCount: items.length,
  });

  return (
    <section
      aria-label="동네별 최근 실거래가"
      className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-card)] p-5"
    >
      <h2 className="text-lg font-bold text-[var(--color-blue-dark)]">동네별 최근 실거래가</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">관심 지역의 거래 내역을 확인하세요</p>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <label className="sr-only" htmlFor="sido-select">시도</label>
        <select
          id="sido-select"
          value={sido}
          onChange={(e) => setSido(e.target.value)}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
        >
          {sidoList.map((s) => (
            <option key={s.code} value={s.sido}>{s.fullName}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="sigungu-select">시군구</label>
        <select
          id="sigungu-select"
          value={sigunguCode}
          onChange={(e) => { setSigunguCode(e.target.value); setUmd(''); }}
          disabled={sigunguLoading}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
        >
          {sigunguList.map((sg) => (
            <option key={sg.code} value={sg.sigunguCode}>{sg.sigungu}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="dong-select">읍·면·동·리</label>
        <select
          id="dong-select"
          value={umd}
          onChange={(e) => setUmd(e.target.value)}
          disabled={cascading}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2"
        >
          {dongs.map((d) => (
            <option key={d.umd} value={d.umd}>{d.umd}</option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="type-select">건물 유형</label>
        <select
          id="type-select"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value as PropertyType)}
          className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        <div className="flex gap-1 rounded-lg bg-[var(--color-soft)] p-1">
          {DEAL_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setDeal(t.key)}
              aria-pressed={deal === t.key}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                deal === t.key ? 'bg-white text-[var(--color-blue-dark)]' : 'text-[var(--color-muted)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 border-t border-[var(--color-line)]">
        {(view === 'loading' || view === 'tx-loading') && (
          <ul className="divide-y divide-[var(--color-line)]" aria-busy="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i} className="py-3">
                <div className="h-4 w-2/3 rounded bg-[var(--color-soft)]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--color-soft)]" />
              </li>
            ))}
          </ul>
        )}

        {(view === 'sigungu-failed' || view === 'dong-failed') && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">지역 목록을 불러오지 못했습니다</p>
            <button
              type="button"
              onClick={() =>
                view === 'sigungu-failed' ? setSidoRetryTick((n) => n + 1) : setSigunguRetryTick((n) => n + 1)
              }
              className="mt-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-blue-dark)]"
            >
              다시 시도
            </button>
          </div>
        )}

        {(view === 'sigungu-empty' || view === 'dong-empty') && (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            이 지역에는 표시할 거래가 없습니다
          </p>
        )}

        {view === 'tx-error' && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">잠시 후 다시 시도해 주세요</p>
            <button
              type="button"
              onClick={() => setRetryTick((n) => n + 1)}
              className="mt-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-blue-dark)]"
            >
              다시 시도
            </button>
          </div>
        )}

        {view === 'tx-empty' && (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            이 조건에 해당하는 거래가 없습니다
          </p>
        )}

        {view === 'results' && (
          <ul className="divide-y divide-[var(--color-line)]">
            {items.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/${SLUG[t.propertyType] ?? 'apt'}/${t.propertyId}`}
                    className="block truncate text-sm font-bold text-[var(--color-blue-dark)] hover:underline"
                  >
                    {t.propertyName}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatDongMeta(t)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${DEAL_BADGE[t.dealType]}`}>
                    {DEAL_LABEL[t.dealType]}
                  </span>
                  <p className="mt-0.5 whitespace-nowrap text-sm font-bold text-[var(--color-blue-dark)]">
                    {formatDongPrice(t)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <SourceCaption ids={['molit-rtms']} />
    </section>
  );
}
