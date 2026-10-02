// 충전소의 약 17%(실측, 충전소 기준)가 '거주자 외 출입제한' 등 이용 제한이 있다. 외부인이 쓸 수 없다는
// 사실을 카드보다 먼저 알린다. 사유가 비어 있으면 지어내지 않고 확인만 권한다.
export function ChargerAccessNotice({
  accessLimited,
  limitDetail,
}: {
  accessLimited: boolean | null;
  limitDetail: string | null;
}) {
  if (accessLimited !== true) return null;
  return (
    <div role="note" className="rounded-2xl border-2 border-[var(--color-red)] bg-[var(--color-card)] px-5 py-4">
      <p className="text-base font-bold text-[var(--color-text)]">이용 제한이 있는 충전소입니다</p>
      <p className="mt-1 text-sm text-[var(--color-text)]">
        {limitDetail ?? '운영기관에 이용 가능 여부를 확인하세요.'}
      </p>
    </div>
  );
}
