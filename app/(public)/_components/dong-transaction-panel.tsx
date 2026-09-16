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

  const [umd, setUmd] = useState(initialUmd);
  const [dongs, setDongs] = useState<DongOption[]>(initialDongs);
  const [dongLoading, setDongLoading] = useState(false);

  const [propertyType, setPropertyType] = useState<PropertyType>('APARTMENT');
  const [deal, setDeal] = useState<DealType | 'ALL'>('ALL');
  const [items, setItems] = useState<DongTransaction[]>(initialItems);
  const [status, setStatus] = useState<Status>('idle');

  // 시도가 바뀌면 시군구 목록을 다시 가져온다. 마운트 시에도 한 번 실행되어 초기
  // 시도의 전체 목록을 채우지만, 그때는 서버가 이미 정해 준 시군구·동 선택을
  // 건드리지 않는다 — 재설정(비우기+첫 항목 자동 선택)은 사용자가 시도를 바꾼
  // 이후에만 한다.
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
        if (!isInitial) setSigunguLoading(false);
      });

    return () => ctl.abort();
  }, [sido]);

  // 시군구가 바뀌면(직접 선택이든 시도 전환의 자동 선택이든) 동 목록을 다시 가져오고
  // 첫 항목을 고른다. 마운트 시에는 서버가 이미 내려준 initialDongs·initialUmd를 쓴다.
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
      // 동이 남아 있으면 안 되므로 비운 채로 둔다.
      setDongs([]);
      setUmd('');
      return;
    }

    const mine = ++dongSeq.current;
    dongAbort.current?.abort();
    const ctl = new AbortController();
    dongAbort.current = ctl;
    setDongLoading(true);
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
      });

    return () => ctl.abort();
  }, [sigunguCode]);

  // 거래 목록 조회. 지역·유형을 빠르게 바꾸면 늦게 온 이전 응답이 최신 결과를
  // 덮을 수 있어 시퀀스로 최신 것만 반영하고 이전 요청은 취소한다. 시군구·동이
  // 캐스케이드 전환 중이라 비어 있으면(buildDongTransactionsQuery가 null) 조회하지 않는다.
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
        setStatus('error');
      });

    return () => ctl.abort();
  }, [sigunguCode, umd, propertyType, deal]);

  // 시군구·동이 아직 정해지지 않은 과도 상태(빈 문자열)도 "캐스케이드 중"으로 본다.
  // 로딩 플래그만 보면 두 effect 사이의 커밋 경계에서 한 프레임 stale 결과가
  // 비칠 수 있어, 선택 자체가 비어 있는지로도 같이 판정한다.
  const cascading = sigunguLoading || dongLoading || !sigunguCode || !umd;

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
        {(status === 'loading' || cascading) && (
          <ul className="divide-y divide-[var(--color-line)]" aria-busy="true">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <li key={i} className="py-3">
                <div className="h-4 w-2/3 rounded bg-[var(--color-soft)]" />
                <div className="mt-2 h-3 w-1/2 rounded bg-[var(--color-soft)]" />
              </li>
            ))}
          </ul>
        )}

        {status === 'error' && !cascading && (
          <div className="py-8 text-center">
            <p className="text-sm text-[var(--color-muted)]">잠시 후 다시 시도해 주세요</p>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              className="mt-2 rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold text-[var(--color-blue-dark)]"
            >
              다시 시도
            </button>
          </div>
        )}

        {status === 'idle' && !cascading && items.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            이 조건에 해당하는 거래가 없습니다
          </p>
        )}

        {status === 'idle' && !cascading && items.length > 0 && (
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
