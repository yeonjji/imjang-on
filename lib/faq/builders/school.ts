import type { FaqItem } from '@/lib/faq/data';

const NEIS = '교육부·학교알리미';

export interface SchoolFaqInput {
  name: string;
  schoolKind: string | null;
  foundType: string | null;
  coeduType: string | null;
  regionFullName: string;
  eduOffice: string | null;
  address: string;
}

/** 학교 상세용 페이지-치환 FAQ(동적 항목만). */
export function buildSchoolFaq(s: SchoolFaqInput): FaqItem[] {
  const items: FaqItem[] = [];
  const name = s.name;

  const parts = [s.foundType, s.schoolKind, s.coeduType].filter((x): x is string => !!x);
  if (parts.length > 0) {
    items.push({
      q: `${name}은 어떤 학교인가요?`,
      a: `${s.regionFullName}에 위치한 ${parts.join(' ')}입니다. 배정·전학 등 행정 절차는 관할 교육지원청과 학교에 문의하세요.`,
      source: NEIS,
    });
  }

  const eduPhrase = s.eduOffice ? ` 관할 교육청은 ${s.eduOffice}입니다.` : '';
  items.push({
    q: `${name}의 위치와 입학·전학 문의는 어디로 하나요?`,
    a: `주소는 ${s.address}입니다.${eduPhrase} 입학·배정·전학 문의는 관할 교육지원청 또는 학교로 하시면 됩니다.`,
    source: NEIS,
  });

  items.push({
    q: `${name} 정보는 어떤 자료 기준인가요?`,
    a: `${name}의 위치·기본 정보는 교육부 및 학교알리미 공시 공공데이터를 기반으로 합니다. 세부 사항은 학교에 확인하세요.`,
    source: NEIS,
  });

  return items;
}
