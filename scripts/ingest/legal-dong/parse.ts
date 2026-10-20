/**
 * 국토교통부 법정동코드 파일(data.go.kr 15123287) 파싱. CP949 CSV: 법정동코드,법정동명,폐지여부.
 * 실거래의 (시군구코드, 동 이름)을 법정동 코드로 바꾸는 조회표를 만든다. 우리 Region 테이블은
 * 일반구 동이 빠져 있어 쓸 수 없다(수원·성남·부천 등).
 */
import { decodeText } from '@/scripts/ingest/school-zone/parse';

export interface LegalDongRow {
  code: string;
  sigunguCode: string;
  /** 시군구명 뒤의 이름: '정자동', '덕산면 두촌리' */
  name: string;
}

export function parseLegalDongCsv(bytes: Uint8Array): LegalDongRow[] {
  const lines = decodeText(bytes).split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = lines[0].split(',').map((c) => c.trim());
  const [iCode, iName, iState] = ['법정동코드', '법정동명', '폐지여부'].map((n) => {
    const i = header.indexOf(n);
    if (i < 0) throw new Error(`legal-dong csv: '${n}' 열이 없다`);
    return i;
  });
  const alive = lines
    .slice(1)
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c[iState] === '존재' && /^\d{10}$/.test(c[iCode]));
  const nameByCode = new Map(alive.map((c) => [c[iCode], c[iName]]));
  const out: LegalDongRow[] = [];
  for (const c of alive) {
    const code = c[iCode];
    if (code.endsWith('00000')) continue; // 시·도, 시군구 행
    const sgg = nameByCode.get(`${code.slice(0, 5)}00000`);
    if (!sgg || !c[iName].startsWith(`${sgg} `)) continue;
    out.push({ code, sigunguCode: code.slice(0, 5), name: c[iName].slice(sgg.length + 1) });
  }
  return out;
}
