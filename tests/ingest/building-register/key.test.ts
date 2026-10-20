import { describe, it, expect } from 'vitest';
import { buildRegisterKey, lookupKey } from '@/scripts/ingest/building-register/key';

const lookup = new Map<string, string[]>([
  [lookupKey('41111', '정자동'), ['4111113000']],
  [lookupKey('44800', '덕산면 두촌리'), ['4480025024']],
  [lookupKey('11110', '중복동'), ['1111010100', '1111010200']],
]);
const p = (umd: string | null, jibun: string | null, sigunguCode = '41111') => ({ sigunguCode, umd, jibun });

describe('buildRegisterKey', () => {
  it('일반구 동 + 번-지', () => {
    expect(buildRegisterKey([p('정자동', '533-104')], lookup)).toEqual({ status: 'ok', key: { bjdCode: '4111113000', platGbCd: '0', bun: '0533', ji: '0104' } });
  });
  it('리 단위 · 지 없는 지번', () => {
    expect(buildRegisterKey([p('덕산면 두촌리', '3147', '44800')], lookup)).toEqual({ status: 'ok', key: { bjdCode: '4480025024', platGbCd: '0', bun: '3147', ji: '0000' } });
  });
  it('산 지번은 대지구분 1', () => {
    expect(buildRegisterKey([p('정자동', '산12')], lookup)).toMatchObject({ key: { platGbCd: '1', bun: '0012' } });
  });
  it('같은 키의 거래가 여러 건이어도 하나', () => {
    expect(buildRegisterKey([p('정자동', '1'), p('정자동', '1')], lookup).status).toBe('ok');
  });
  it('서로 다른 지번이 섞이면 multi_pair', () => {
    expect(buildRegisterKey([p('정자동', '1'), p('정자동', '2')], lookup).status).toBe('multi_pair');
  });
  it('변환 못 하는 쌍이 하나라도 있으면 bad_key(호출하지 않는다)', () => {
    expect(buildRegisterKey([p('정자동', '1'), p('정자동', '')], lookup).status).toBe('bad_key');
    expect(buildRegisterKey([p('없는동', '1')], lookup).status).toBe('bad_key');
    expect(buildRegisterKey([p('중복동', '1', '11110')], lookup).status).toBe('bad_key');
    expect(buildRegisterKey([p('정자동', '12-3-4')], lookup).status).toBe('bad_key');
    expect(buildRegisterKey([], lookup).status).toBe('bad_key');
  });
});
