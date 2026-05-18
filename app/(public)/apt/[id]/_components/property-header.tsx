import type { Property, Region } from '@prisma/client';

export function PropertyHeader({ property, region }: { property: Property; region: Region }) {
  return (
    <header>
      <h1 className="text-3xl font-black text-[var(--color-blue-dark)] md:text-4xl">{property.name}</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        {region.fullName}
        {property.builtYear ? ` · ${property.builtYear}년 준공` : ''}
        {property.households ? ` · ${property.households.toLocaleString('ko-KR')}세대` : ''}
      </p>
    </header>
  );
}
