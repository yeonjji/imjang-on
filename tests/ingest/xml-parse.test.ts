import { describe, it, expect } from 'vitest';
import { parseXml, getItems, getTotalCount } from '@/scripts/ingest/xml-parse';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <header><resultCode>00</resultCode></header>
  <body>
    <items>
      <item><aptNm>래미안</aptNm><dealAmount>125,000</dealAmount></item>
      <item><aptNm>자이</aptNm><dealAmount>98,500</dealAmount></item>
    </items>
    <totalCount>2</totalCount>
  </body>
</response>`;

describe('xml-parse', () => {
  it('parses XML', () => {
    const obj = parseXml(SAMPLE);
    expect(getTotalCount(obj)).toBe(2);
  });
  it('extracts items', () => {
    expect(getItems(parseXml(SAMPLE))).toHaveLength(2);
  });
  it('handles empty', () => {
    const empty = `<response><body><totalCount>0</totalCount><items/></body></response>`;
    expect(getItems(parseXml(empty))).toEqual([]);
  });
});
