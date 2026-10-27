// 국립중앙의료원 병·의원 찾기(getHsptlMdcncListInfoInqire) 응답 파싱. 서버·스크립트 공용 순수 함수.
import { XMLParser } from 'fast-xml-parser';

export type NemcHoursValues = {
  openMon: number | null; closeMon: number | null; openTue: number | null; closeTue: number | null;
  openWed: number | null; closeWed: number | null; openThu: number | null; closeThu: number | null;
  openFri: number | null; closeFri: number | null; openSat: number | null; closeSat: number | null;
  openSun: number | null; closeSun: number | null; openHol: number | null; closeHol: number | null;
};

export interface NemcHospital {
  hpid: string;
  name: string;
  addr: string;
  tel: string;
  hours: NemcHoursValues;
  note: string | null;
}

// dutyTime 번호 → 컬럼 접미사 (1=월 … 7=일, 8=공휴일)
const DAY_SUFFIX = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Hol'] as const;

// '00'이 숫자 0이 되지 않게 값을 문자열로 둔다(ev-status 교훈).
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

export function toHhmm(v: string | undefined): number | null {
  if (!v || !/^\d{3,4}$/.test(v)) return null;
  return Number(v);
}

export function parseNemcPage(xml: string): { resultCode: string; totalCount: number; items: NemcHospital[] } {
  const doc = parser.parse(xml) as {
    response?: { header?: { resultCode?: string }; body?: { items?: { item?: unknown } | ''; totalCount?: string } };
  };
  const body = doc.response?.body;
  const raw = body?.items && typeof body.items === 'object' ? body.items.item : undefined;
  const arr = (raw ? (Array.isArray(raw) ? raw : [raw]) : []) as Record<string, string | undefined>[];
  return {
    resultCode: String(doc.response?.header?.resultCode ?? ''),
    totalCount: Number(body?.totalCount ?? 0),
    items: arr.map((it) => {
      const hours = {} as NemcHoursValues;
      DAY_SUFFIX.forEach((d, i) => {
        hours[`open${d}`] = toHhmm(it[`dutyTime${i + 1}s`]);
        hours[`close${d}`] = toHhmm(it[`dutyTime${i + 1}c`]);
      });
      const etc = (it.dutyEtc ?? '').trim();
      return {
        hpid: String(it.hpid ?? ''),
        name: String(it.dutyName ?? ''),
        addr: String(it.dutyAddr ?? ''),
        tel: String(it.dutyTel1 ?? ''),
        hours,
        note: etc ? etc.slice(0, 300) : null,
      };
    }),
  };
}
