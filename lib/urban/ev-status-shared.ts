// 충전소 실시간 상태의 순수 헬퍼·타입. 서버 전용 env를 import하지 않아 클라이언트 컴포넌트에서도 쓴다.

export interface ChargerUnitStatus {
  chgerId: string;
  stat: string;
  statLabel: string;
  lastTsdt: string | null;
}

/** 충전소 ID(statId) 형식 검사 — 외부 API로 넘기기 전에 거른다. */
export function isValidStatId(v: string | null | undefined): v is string {
  return !!v && /^[A-Za-z0-9]{1,20}$/.test(v);
}

export interface ChargerUnitPlain {
  chgerId: string;
  chgerType: string;
  isFast: boolean;
}

export interface ChargerUnitRow extends ChargerUnitPlain {
  stat: string;
  statLabel: string;
}

export function mergeUnitStatuses(units: ChargerUnitPlain[], statuses: ChargerUnitStatus[]): ChargerUnitRow[] {
  const byId = new Map(statuses.map((s) => [s.chgerId, s]));
  return units.map((u) => {
    const s = byId.get(u.chgerId);
    return { ...u, stat: s?.stat ?? '0', statLabel: s?.statLabel ?? '미확인' };
  });
}
