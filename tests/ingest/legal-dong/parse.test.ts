import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseLegalDongCsv } from '@/scripts/ingest/legal-dong/parse';

describe('parseLegalDongCsv', () => {
  it('존재하는 동·리만, 시군구명 뒤 이름으로(CP949)', () => {
    const rows = parseLegalDongCsv(new Uint8Array(readFileSync('tests/ingest/fixtures/legal-dong/legal-dong.csv')));
    expect(rows).toEqual([
      { code: '4111113000', sigunguCode: '41111', name: '정자동' },
      { code: '4480025024', sigunguCode: '44800', name: '덕산면 두촌리' },
      { code: '3611010100', sigunguCode: '36110', name: '반곡동' },
    ]);
  });
});
