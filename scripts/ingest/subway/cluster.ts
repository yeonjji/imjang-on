export interface RawStationRow {
  name: string;
  lineName: string;
  operator: string | null;
  address: string | null;
  lat: number;
  lng: number;
  dataStdDate: Date | null;
}

export interface StationCluster {
  name: string;
  lines: string[];
  operators: string[];
  address: string | null;
  lat: number;
  lng: number;
  isTransfer: boolean;
  dataStdDate: Date | null;
  sourceKey: string;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// "N호선"은 번호 오름차순(앞), 명칭 노선은 가나다순(뒤)
export function sortLines(lines: string[]): string[] {
  const numOf = (l: string) => {
    const m = /^(\d+)호선$/.exec(l);
    return m ? Number(m[1]) : Infinity;
  };
  return [...new Set(lines)].sort((a, b) => {
    const na = numOf(a), nb = numOf(b);
    if (na !== nb) return na - nb;
    return a.localeCompare(b, 'ko');
  });
}

export function clusterStations(rows: RawStationRow[], thresholdMeters = 700): StationCluster[] {
  const byName = new Map<string, RawStationRow[]>();
  for (const r of rows) {
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }

  const clusters: StationCluster[] = [];
  for (const [, group] of byName) {
    const buckets: RawStationRow[][] = [];
    for (const r of group) {
      const hit = buckets.find((b) =>
        b.some((m) => haversineMeters(m.lat, m.lng, r.lat, r.lng) <= thresholdMeters),
      );
      if (hit) hit.push(r);
      else buckets.push([r]);
    }
    for (const bucket of buckets) {
      const lat = bucket.reduce((s, r) => s + r.lat, 0) / bucket.length;
      const lng = bucket.reduce((s, r) => s + r.lng, 0) / bucket.length;
      const lines = sortLines(bucket.map((r) => r.lineName));
      const operators = [...new Set(bucket.map((r) => r.operator).filter((v): v is string => !!v))];
      const dates = bucket.map((r) => r.dataStdDate).filter((d): d is Date => d != null);
      const dataStdDate = dates.length
        ? dates.reduce((a, b) => (a > b ? a : b))
        : null;
      const rLat = lat.toFixed(4);
      const rLng = lng.toFixed(4);
      clusters.push({
        name: bucket[0].name,
        lines,
        operators,
        address: bucket[0].address,
        lat,
        lng,
        isTransfer: lines.length > 1,
        dataStdDate,
        sourceKey: `${bucket[0].name}__${rLat}_${rLng}`,
      });
    }
  }
  return clusters;
}
