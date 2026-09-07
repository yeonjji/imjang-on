import { describe, it, expect } from 'vitest';
import { assertNotQuotaExceeded, QuotaExceededError } from '@/scripts/ingest/apt-complex/http';

describe('assertNotQuotaExceeded', () => {
  it('정상 응답은 통과시킨다', () => {
    expect(() =>
      assertNotQuotaExceeded({
        response: { header: { resultCode: '00', resultMsg: 'NORMAL SERVICE' } },
      }),
    ).not.toThrow();
  });

  it('한도 초과 응답이면 QuotaExceededError', () => {
    expect(() =>
      assertNotQuotaExceeded({
        OpenAPI_ServiceResponse: {
          cmmMsgHeader: { errMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' },
        },
      }),
    ).toThrow(QuotaExceededError);
  });

  it('본문 어디에 있든 감지한다', () => {
    expect(() =>
      assertNotQuotaExceeded({
        response: { header: { resultMsg: 'LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR' } },
      }),
    ).toThrow(QuotaExceededError);
  });

  it('XML 문자열로 와도 감지한다', () => {
    expect(() =>
      assertNotQuotaExceeded('<errMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</errMsg>'),
    ).toThrow(QuotaExceededError);
  });

  it('null·undefined는 통과시킨다', () => {
    expect(() => assertNotQuotaExceeded(null)).not.toThrow();
    expect(() => assertNotQuotaExceeded(undefined)).not.toThrow();
  });
});
