import { describe, it, expect } from 'vitest';
import {
  extractHrefs,
  auditLinks,
  auditUrl,
  auditUnitSums,
  auditSourceAgency,
} from '@/lib/board/content-audit';

/**
 * 자동 링크는 우리 코드가 아니라 remark-gfm(GFM autolink literal)이 만든다.
 * 아래는 "고쳐야 할 규칙"이 아니라 **현재 실제 동작**을 못박아 두는 특성 테스트다.
 * 동작이 바뀌면(의도했든 아니든) 여기서 먼저 깨진다.
 */
describe('GFM 자동 링크 실제 동작', () => {
  it('맨 URL 뒤에 한글이 붙으면 URL이 한글까지 삼킨다 — /board/94·95를 깨뜨린 사고', () => {
    const hrefs = extractHrefs('접수는 인터넷청약시스템(www.i-sh.co.kr/app)에서 합니다.');
    expect(hrefs).toEqual(['http://www.i-sh.co.kr/app)에서']);
  });

  it('마크다운 링크로 적으면 괄호·조사가 URL 밖에 남는다 — 이번 수정 형태', () => {
    const hrefs = extractHrefs(
      '접수는 인터넷청약시스템([www.i-sh.co.kr/app](https://www.i-sh.co.kr/app/index.do))에서 합니다.',
    );
    expect(hrefs).toEqual(['https://www.i-sh.co.kr/app/index.do']);
  });

  it('이미 마크다운 링크인 텍스트는 다시 링크화되지 않는다', () => {
    expect(extractHrefs('[SH 청약](https://www.i-sh.co.kr/app/index.do)')).toEqual([
      'https://www.i-sh.co.kr/app/index.do',
    ]);
  });

  it('문장 끝 마침표·쉼표는 URL 밖에 남는다', () => {
    expect(extractHrefs('자세한 내용은 https://example.go.kr/a 에 있습니다.')).toEqual([
      'https://example.go.kr/a',
    ]);
    expect(extractHrefs('https://example.go.kr/a, https://example.go.kr/b.')).toEqual([
      'https://example.go.kr/a',
      'https://example.go.kr/b',
    ]);
  });

  it('닫는 괄호는 뒤가 공백일 때만 URL 밖으로 밀려난다', () => {
    expect(extractHrefs('신청처(https://example.go.kr/apply) 참고')).toEqual([
      'https://example.go.kr/apply',
    ]);
  });

  it('괄호 뒤에 조사가 붙으면 괄호까지 URL에 들어간다 — 괄호 규칙을 믿으면 안 된다', () => {
    expect(extractHrefs('신청처(https://example.go.kr/apply)는 아래와 같습니다.')).toEqual([
      'https://example.go.kr/apply)는',
    ]);
  });

  it('꺾쇠 자동 링크(<url>)는 조사를 삼키지 않는다 — 화면에 주소를 그대로 남길 때 쓰는 형태', () => {
    expect(extractHrefs('누리집(<https://fill4young.kinfa.or.kr/>)에서 확인할 수 있다.')).toEqual([
      'https://fill4young.kinfa.or.kr/',
    ]);
    expect(extractHrefs('네이버 폼(<https://naver.me/5ssJwaLv>)에서 접수한다.')).toEqual([
      'https://naver.me/5ssJwaLv',
    ]);
  });

  it('쿼리스트링과 fragment는 그대로 유지된다', () => {
    expect(extractHrefs('https://example.go.kr/a?b=1&c=2#sec3 참고')).toEqual([
      'https://example.go.kr/a?b=1&c=2#sec3',
    ]);
  });
});

describe('auditLinks', () => {
  it('자동 링크가 조사를 삼킨 URL을 unbalanced-paren으로 잡는다', () => {
    expect(auditLinks('접수는 인터넷청약시스템(www.i-sh.co.kr/app)에서 합니다.')).toEqual([
      { href: 'http://www.i-sh.co.kr/app)에서', issue: 'unbalanced-paren' },
    ]);
  });

  it('수정한 본문은 지적 사항이 없다', () => {
    expect(
      auditLinks(
        '접수는 인터넷청약시스템([www.i-sh.co.kr/app](https://www.i-sh.co.kr/app/index.do))에서 합니다.',
      ),
    ).toEqual([]);
  });

  it('비ASCII 호스트(punycode 변환)를 잡는다', () => {
    expect(auditLinks('[안내](https://취급은행홈페이지/a)')).toEqual([
      { href: 'https://취급은행홈페이지/a', issue: 'bad-host' },
    ]);
  });

  it('http/https가 아닌 스킴은 잡는다', () => {
    expect(auditLinks('[메일](mailto:a@b.co.kr)')).toEqual([
      { href: 'mailto:a@b.co.kr', issue: 'non-http-scheme' },
    ]);
  });

  it('내부 상대경로는 검사하지 않는다', () => {
    expect(auditLinks('[실거래가](/list) · [청약](/subscription)')).toEqual([]);
  });

  it('경로에 한글이 있어도 정상 링크는 통과한다', () => {
    expect(auditLinks('[종합부동산세법](https://www.law.go.kr/법령/종합부동산세법)')).toEqual([]);
  });

  it('괄호가 짝이 맞는 URL은 통과한다', () => {
    expect(auditLinks('[문서](https://ko.wikipedia.org/wiki/서울_(도시))')).toEqual([]);
  });
});

/** 마크다운 밖의 값 검사 — /finance/1의 rltsite처럼 API가 URL 자리에 문구를 넣는 경우. */
describe('auditUrl', () => {
  it('URL에 공백이 있으면 잡는다', () => {
    expect(auditUrl('https://취급은행 홈페이지')).toBe('whitespace');
  });

  it('정상 URL과 맨 호스트는 통과한다', () => {
    expect(auditUrl('https://www.gnsinbo.or.kr')).toBeNull();
    expect(auditUrl('www.gnsinbo.or.kr')).toBeNull();
  });
});

describe('auditUnitSums', () => {
  // /board/84 게시본. 개별 값은 SubscriptionNotice 실측과 일치하고 합계만 틀렸다.
  const BROKEN =
    '이 중 임의공급 유형은 대전 하늘채 루시에르 19세대, 광명 소하 파크타워 7세대, 중앙하이츠 원종역 16세대로 총 42세대를 공급한다. ' +
    '아파트 유형은 달서자이 제니크 360세대, 시흥거모 A-5블록 신혼희망타운 290세대, 더샵 신길센트럴시티 67세대, ' +
    '용인반도체클러스터 동일하이빌 파크밸리 589세대, 써밋 클라비온 176세대, 충정로역자이르네 186세대, ' +
    '두산위브더제니스 부천 1,158세대로 총 2,822세대를 공급한다. ' +
    '무순위·잔여 유형은 힐스테이트 초월역 1세대, 송파 시그니처 롯데캐슬 1세대로 2세대가 공급된다.\n\n' +
    '총 세대 수를 합산하면 2,748세대로, 다양한 규모가 포함되어 있다.';

  it('열거한 값의 합과 적어 둔 합계가 다르면 잡는다', () => {
    const group = auditUnitSums(BROKEN).filter((f) => f.kind === 'group');
    expect(group).toHaveLength(1);
    expect(group[0]).toMatchObject({ stated: 2822, expected: 2826 });
    expect(group[0].items).toEqual([360, 290, 67, 589, 176, 186, 1158]);
  });

  it('문서 전체 합산 문장도 그룹 합계의 합과 대조한다', () => {
    const doc = auditUnitSums(BROKEN).filter((f) => f.kind === 'document');
    expect(doc).toHaveLength(1);
    expect(doc[0]).toMatchObject({ stated: 2748, expected: 2870 });
  });

  it('수정본은 지적 사항이 없다', () => {
    const fixed = BROKEN.replace('총 2,822세대', '총 2,826세대').replace(
      '합산하면 2,748세대',
      '합산하면 2,870세대',
    );
    expect(auditUnitSums(fixed)).toEqual([]);
  });

  it('열거가 아닌 단일 서술 문장은 판단하지 않는다', () => {
    expect(auditUnitSums('이번 물량은 1,381호인데 신규는 291세대로 330세대가 배정된다.')).toEqual(
      [],
    );
  });
});

describe('auditSourceAgency', () => {
  it('표시 기관명과 출처 도메인이 어긋나면 경고한다', () => {
    expect(
      auditSourceAgency({ sourceName: '임장ON 청약 집계(원자료: 청약홈·LH)', sourceUrl: 'https://rt.molit.go.kr/' }),
    ).toMatchObject({ agency: '임장ON 청약 집계', host: 'rt.molit.go.kr' });
  });

  it('/board/90의 실제 값은 국토교통부로 정규화돼 도메인과 맞는다', () => {
    expect(
      auditSourceAgency({
        sourceName: '임장ON 실거래 집계 · 국토교통부 실거래가 공개시스템',
        sourceUrl: 'https://rt.molit.go.kr/',
      }),
    ).toBeNull();
  });

  it('매핑에 없는 기관명은 판단하지 않는다', () => {
    expect(
      auditSourceAgency({ sourceName: 'SH 서울주택도시개발공사', sourceUrl: 'https://www.i-sh.co.kr/' }),
    ).toBeNull();
  });
});
