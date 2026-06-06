import { describe, it, expect } from 'vitest';
import {
  parseXml,
  getItems,
  getTotalCount,
  assertNormalResponse,
  QuotaExceededError,
} from '@/scripts/ingest/xml-parse';

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

describe('assertNormalResponse', () => {
  it('정상 응답(resultCode 00)은 통과', () => {
    const xml = `<response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header><body><items/><totalCount>0</totalCount></body></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).not.toThrow();
  });

  it('header 없는 빈 응답도 통과(정상 0건과 구분)', () => {
    const xml = `<response><body><totalCount>0</totalCount><items/></body></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).not.toThrow();
  });

  it('표준 quota 초과(resultCode 22)는 QuotaExceededError', () => {
    const xml = `<response><header><resultCode>22</resultCode><resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</resultMsg></header></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).toThrow(QuotaExceededError);
  });

  it('레거시 게이트웨이 quota 초과(returnReasonCode 22)도 QuotaExceededError', () => {
    const xml = `<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>`;
    expect(() => assertNormalResponse(parseXml(xml))).toThrow(QuotaExceededError);
  });

  it('기타 비정상 코드는 일반 Error', () => {
    const xml = `<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED ERROR</resultMsg></header></response>`;
    expect(() => assertNormalResponse(parseXml(xml))).toThrow(/resultCode=30/);
  });
});
