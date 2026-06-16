import { describe, it, expect } from 'vitest';
import { parseRssItems, htmlToText, splitAgencyPrefix, decodeEntities } from '@/scripts/ingest/posts/rss';

// 실제 korea.kr 정책브리핑 RSS 구조를 반영한 고정 샘플(item 2개: 배열 분기 + 엔티티 + HTML 본문).
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
  <channel>
    <title>보도자료</title>
    <item>
      <title><![CDATA[[국토교통부]디딤돌 대출 한도 상향&middot;7월 시행]]></title>
      <link><![CDATA[https://www.korea.kr/briefing/pressReleaseView.do?newsId=111]]></link>
      <pubDate>Mon, 15 Jun 2026 01:00:00 GMT</pubDate>
      <dc:date>2026-06-15T01:00:00Z</dc:date>
      <description><![CDATA[<a href='x'><img src='y'/></a><br/><p style="font-size:14pt;">국토교통부는 &quot;디딤돌&quot; 대출 한도를 상향한다.</p><p>&nbsp;</p><p>7월 1일부터 시행한다.</p>]]></description>
    </item>
    <item>
      <title><![CDATA[[농촌진흥청]고유가 농식품 조사 결과]]></title>
      <link><![CDATA[https://www.korea.kr/briefing/pressReleaseView.do?newsId=222]]></link>
      <pubDate>Tue, 16 Jun 2026 06:00:00 GMT</pubDate>
      <description><![CDATA[<p>조사 결과를 발표했다.</p>]]></description>
    </item>
  </channel>
</rss>`;

describe('decodeEntities', () => {
  it('명명·숫자 엔티티를 푼다', () => {
    expect(decodeEntities('A&quot;B&middot;C&amp;D&#39;E&#x2026;')).toBe('A"B·C&D\'E…');
  });
  it('알 수 없는 엔티티는 그대로 둔다', () => {
    expect(decodeEntities('&unknownent;')).toBe('&unknownent;');
  });
});

describe('htmlToText', () => {
  it('태그 제거 + 블록은 줄바꿈 + 엔티티 디코드', () => {
    const out = htmlToText('<p>가나다</p><p>&nbsp;</p><p>라마바</p>');
    expect(out).toBe('가나다\n라마바');
  });
  it('br을 줄바꿈으로', () => {
    expect(htmlToText('가<br/>나')).toBe('가\n나');
  });
});

describe('splitAgencyPrefix', () => {
  it('[기관명] 접두어를 분리', () => {
    expect(splitAgencyPrefix('[국토교통부]디딤돌 한도 상향')).toEqual({ agency: '국토교통부', title: '디딤돌 한도 상향' });
  });
  it('접두어 없으면 agency=null', () => {
    expect(splitAgencyPrefix('그냥 제목')).toEqual({ agency: null, title: '그냥 제목' });
  });
});

describe('parseRssItems', () => {
  it('item 배열을 FeedItem[]로 파싱', () => {
    const items = parseRssItems(SAMPLE);
    expect(items).toHaveLength(2);
    const first = items[0];
    expect(first.agency).toBe('국토교통부');
    expect(first.title).toBe('디딤돌 대출 한도 상향·7월 시행');
    expect(first.link).toBe('https://www.korea.kr/briefing/pressReleaseView.do?newsId=111');
    expect(first.pubDate?.toISOString()).toBe('2026-06-15T01:00:00.000Z');
    expect(first.bodyText).toBe('국토교통부는 "디딤돌" 대출 한도를 상향한다.\n7월 1일부터 시행한다.');
  });
  it('item이 없으면 빈 배열', () => {
    expect(parseRssItems('<rss><channel><title>x</title></channel></rss>')).toEqual([]);
  });
});
