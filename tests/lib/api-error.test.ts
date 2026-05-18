import { describe, it, expect } from 'vitest';
import { ApiError, apiErrorResponse } from '@/lib/api-error';

describe('ApiError', () => {
  it('wraps known errors as JSON Response', async () => {
    const res = apiErrorResponse(new ApiError('NOT_FOUND', '단지 없음', 404));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: '단지 없음' } });
  });

  it('wraps unknown errors as INTERNAL_ERROR', async () => {
    const res = apiErrorResponse(new Error('boom'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
  });
});
