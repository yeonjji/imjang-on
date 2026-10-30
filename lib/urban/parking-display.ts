// 주차장 상세의 표시 판정(컴포넌트·목록 점수 공용).
import type { HourBlocks } from '@/lib/urban/parking-hours';

type HourRow = {
  weekdayOpenHhmm: string | null; weekdayCloseHhmm: string | null;
  satOpenHhmm: string | null; satCloseHhmm: string | null;
  holidayOpenHhmm: string | null; holidayCloseHhmm: string | null;
};

export function parkingHourBlocks(row: HourRow): HourBlocks {
  return {
    weekdayOpen: row.weekdayOpenHhmm, weekdayClose: row.weekdayCloseHhmm,
    satOpen: row.satOpenHhmm, satClose: row.satCloseHhmm,
    holidayOpen: row.holidayOpenHhmm, holidayClose: row.holidayCloseHhmm,
  };
}

export function parkingExtrasFlags(row: { pwdbsPpkZoneYn: boolean | null; enforceSe: string | null; feedingSe: string | null; spcmnt: string | null }) {
  return {
    hasBadges: !!row.pwdbsPpkZoneYn || !!row.enforceSe || !!row.feedingSe,
    hasNote: (row.spcmnt ?? '').trim().length > 0,
  };
}
