import { describe, it, expect } from 'vitest';
import { buildSchoolNarrative, type SchoolInsightInput } from '@/lib/insights/school';

const base: SchoolInsightInput = {
  name: '서울중앙중학교',
  schoolKind: '중학교',
  foundType: '공립',
  coeduType: '남여공학',
  nearbySchoolCounts: [{ kind: '중학교', count: 1 }, { kind: '초등학교', count: 2 }],
  nearestStation: { name: '시청역', lines: ['1호선'], distanceMeters: 400 },
  infra: [{ label: '카페', count: 5 }, { label: '병원', count: 3 }, { label: '약국', count: 2 }],
  nearbyAptSaleManwon: [90000, 130000, 175000],
};

describe('buildSchoolNarrative', () => {
  it('풍부 데이터면 이름으로 시작하고 intro+district+access+price 발화', () => {
    const n = buildSchoolNarrative(base)!;
    expect(n.sentences[0].startsWith('서울중앙중학교은') || n.sentences[0].startsWith('서울중앙중학교는')).toBe(true);
    expect(n.fired).toEqual(['intro', 'district', 'access', 'price']);
  });

  it('intro: 공립 + 남여공학 → "공립 남녀공학 중학교"(정규화)', () => {
    expect(buildSchoolNarrative(base)!.text).toContain('공립 남녀공학 중학교입니다');
  });

  it('intro: 사립 + 남 → "사립 남자고등학교"', () => {
    const n = buildSchoolNarrative({ ...base, schoolKind: '고등학교', foundType: '사립', coeduType: '남' })!;
    expect(n.text).toContain('사립 남자고등학교입니다');
  });

  it('intro: found 기타/null이면 접두 생략, 여 → "여자중학교"', () => {
    const n = buildSchoolNarrative({ ...base, foundType: '기타', coeduType: '여' })!;
    expect(n.text).toContain('여자중학교입니다');
    expect(n.text).not.toContain('기타');
  });

  it('intro: schoolKind 없고 foundType만 있으면 "공립 학교"', () => {
    const n = buildSchoolNarrative({ ...base, schoolKind: null, coeduType: null })!;
    expect(n.text).toContain('공립 학교입니다');
  });

  it('district: 고정 순서(초→중)로 정렬·나열', () => {
    // 입력은 중학교 먼저지만 출력은 초등학교 먼저
    expect(buildSchoolNarrative(base)!.text).toContain('도보권에 초등학교 2곳·중학교 1곳이 있어 학령기 학교가 가깝습니다');
  });

  it('district: count 0은 제외', () => {
    const n = buildSchoolNarrative({ ...base, nearbySchoolCounts: [{ kind: '초등학교', count: 2 }, { kind: '고등학교', count: 0 }] })!;
    expect(n.text).toContain('초등학교 2곳이 있어');
    expect(n.text).not.toContain('고등학교');
  });

  it('게이트: district 미발화(도보권 학교 없음)면 intro+access+price라도 null', () => {
    expect(buildSchoolNarrative({ ...base, nearbySchoolCounts: [] })).toBeNull();
  });

  it('게이트: district+intro만(access·price 없음)이면 minFired 3 미달 → null', () => {
    expect(
      buildSchoolNarrative({ ...base, nearestStation: null, infra: [], nearbyAptSaleManwon: [] }),
    ).toBeNull();
  });

  it('게이트: district+intro+access면 발화(3개)', () => {
    const n = buildSchoolNarrative({ ...base, nearbyAptSaleManwon: [] })!;
    expect(n.fired).toEqual(['intro', 'district', 'access']);
  });
});
