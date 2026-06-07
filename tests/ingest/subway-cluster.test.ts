import { describe, it, expect } from 'vitest';
import { clusterStations, type RawStationRow } from '@/scripts/ingest/subway/cluster';

function row(p: Partial<RawStationRow>): RawStationRow {
  return {
    name: '가락시장', lineName: '3호선', operator: '서울교통공사',
    address: '서울 송파구', lat: 37.4923, lng: 127.1177, dataStdDate: null, ...p,
  };
}

describe('clusterStations', () => {
  it('같은 이름 + 근접 좌표(환승역)는 1개 논리역으로 통합하고 노선을 합친다', () => {
    const out = clusterStations([
      row({ lineName: '3호선', lat: 37.492318, lng: 127.1177 }),
      row({ lineName: '8호선', lat: 37.493004, lng: 127.118279 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].lines).toEqual(['3호선', '8호선']);
    expect(out[0].isTransfer).toBe(true);
  });

  it('노선 번호 오름차순 정렬 후 명칭 노선이 뒤', () => {
    const out = clusterStations([
      row({ lineName: '신분당선' }),
      row({ lineName: '2호선' }),
      row({ lineName: '9호선' }),
    ]);
    expect(out[0].lines).toEqual(['2호선', '9호선', '신분당선']);
  });

  it('같은 이름이라도 임계거리(700m) 초과면 분리한다', () => {
    const out = clusterStations([
      row({ name: '중앙', lat: 37.5, lng: 127.0 }),
      row({ name: '중앙', lat: 37.6, lng: 127.2 }), // ~약 20km
    ]);
    expect(out).toHaveLength(2);
  });

  it('단일 노선역은 isTransfer=false, sourceKey가 안정적이다', () => {
    const out = clusterStations([row({ name: '가능역', lineName: '경원선', lat: 37.7484, lng: 127.0443 })]);
    expect(out[0].isTransfer).toBe(false);
    expect(out[0].sourceKey).toBe('가능역__37.7484_127.0443');
  });
});
