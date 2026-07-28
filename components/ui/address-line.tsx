import { Badge } from '@/components/ui/badge';
import { SourceCaption } from '@/components/ui/source-caption';
import { CopyButton } from '@/components/ui/copy-button';

interface AddressLineProps {
  /** 완성된 표시용 주소 문자열 */
  display: string;
  /** 이 단지의 거래가 단일 지번에 모여 있어 주소가 확정적인지 */
  confirmed: boolean;
}

/**
 * 지도 섹션 상단의 주소 줄. 서버 컴포넌트다.
 * 복사 기능만 CopyButton(클라이언트)으로 분리해 텍스트·배지·출처는 클라이언트 번들에
 * 넣지 않는다. Next는 클라이언트 컴포넌트도 SSR하므로 색인 목적의 분리가 아니라
 * 번들 크기 목적의 분리다.
 */
export function AddressLine({ display, confirmed }: AddressLineProps) {
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[var(--color-text)]">{display}</p>
        {!confirmed && <Badge tone="gray">대표 지번</Badge>}
        <CopyButton value={display} label="주소 복사" />
      </div>
      {!confirmed && (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          이 단지의 거래는 여러 지번에 걸쳐 있습니다.
        </p>
      )}
      <SourceCaption ids={['molit-rtms']} />
    </div>
  );
}
