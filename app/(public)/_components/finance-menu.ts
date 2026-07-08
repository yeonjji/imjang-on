/**
 * 금융정보 항목 SSOT(데스크톱 nav · 모바일 드로어 · 리스트 형제 탭 공용).
 * `label`은 드롭다운/드로어용 전체 명칭, `tabLabel`은 형제 탭 바용 짧은 명칭.
 */
export const FINANCE_ITEMS: { href: string; label: string; tabLabel: string }[] = [
  { href: '/finance', label: '서민금융 대출상품', tabLabel: '서민금융' },
  { href: '/jeonse-guarantee', label: '맞춤 전세보증 찾기', tabLabel: '전세보증' },
];
