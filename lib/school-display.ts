// 나이스 학교 필드를 화면 문구로 바꾸는 순수 함수.
import type { School } from '@prisma/client';

/** 계열·입학 전형은 고등학교에서만 의미가 있다(초·중·특수학교는 '일반계'·'전기'가 기본값으로 채워져 온다). */
export function isHighSchool(kind: string | null | undefined): boolean {
  return kind === '고등학교';
}

/** 개교기념일이 설립일보다 이만큼 넘게 늦으면 개교 연도로 믿지 않는다(부설 학교의 재지정일 등). */
const MAX_FOUNDED_TO_OPEN_YEARS = 5;

export function schoolOpenYears(
  anniversaryAt: Date | null | undefined,
  nowYear: number,
  foundedAt?: Date | null,
): number | null {
  if (!anniversaryAt) return null;
  const y = anniversaryAt.getUTCFullYear();
  if (foundedAt && y - foundedAt.getUTCFullYear() > MAX_FOUNDED_TO_OPEN_YEARS) return null;
  return y > nowYear ? null : nowYear - y;
}

export function formatYmd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function formatMonthDay(d: Date | null | undefined): string | null {
  return d ? `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일` : null;
}

/** '1989년 4월 28일' — 히어로의 "개교 N년"을 독자가 확인할 수 있게 연도까지 보인다. */
export function formatYmdKo(d: Date | null | undefined): string | null {
  return d ? `${d.getUTCFullYear()}년 ${formatMonthDay(d)}` : null;
}

/** 학교 상세 '학교 정보' 표의 행(컴포넌트·목록 점수 공용). 값이 null이면 화면에 '-'. */
export function schoolInfoRows(
  school: Pick<School, 'schoolKind' | 'foundType' | 'coeduType' | 'hsType' | 'hsTrack' | 'specialPurpose' | 'admissionPeriod' | 'foundedAt' | 'anniversaryAt' | 'eduOffice' | 'tel'>,
): [string, string | null][] {
  const high = isHighSchool(school.schoolKind);
  // '일반계'는 일반고에선 중복, 특목고에선 모순처럼 읽혀 붙이지 않는다. 전문계 등만 덧붙인다.
  const track = school.hsTrack && school.hsTrack !== '일반계' ? school.hsTrack : null;
  const hsTypeTrack = [school.hsType, track].filter(Boolean).join(' · ') || null;
  return [
    ['학교급', school.schoolKind],
    ['설립유형', school.foundType],
    ['남녀공학', school.coeduType],
    ...(high
      ? ([
          ['고교 유형', hsTypeTrack],
          ['특목고 계열', school.specialPurpose],
          ['입학 전형', school.admissionPeriod],
        ] as [string, string | null][])
      : []),
    ['설립일', formatYmd(school.foundedAt)],
    ['개교일', formatYmdKo(school.anniversaryAt)],
    ['관할 교육청', school.eduOffice],
    ['전화', school.tel],
  ];
}
