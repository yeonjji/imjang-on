import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { NoticeWithUnits, NormalizedNotice } from './types';

function locationSql(lat: number | null, lng: number | null) {
  return lat != null && lng != null
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`
    : Prisma.sql`NULL::geography`;
}

// source+sourceKey 기준 upsert 후 id 반환
async function upsertNotice(n: NormalizedNotice): Promise<bigint> {
  const rows = await prisma.$queryRaw<{ id: bigint }[]>`
    INSERT INTO "SubscriptionNotice" (
      "source", "category", "sourceKey",
      "houseManageNo", "pblancNo", "panId", "origNoticeKey",
      "name", "status", "regionCode", "regionName", "address", "totalSupply",
      "noticeDate", "receiptBegin", "receiptEnd", "winnerDate", "contractBegin", "contractEnd", "moveInYm",
      "homepage", "noticeUrl", "developer", "constructor", "tel",
      "location", "rawJson", "updatedAt"
    ) VALUES (
      ${n.source}::"SubscriptionSource", ${n.category}::"SubscriptionCategory", ${n.sourceKey},
      ${n.houseManageNo}, ${n.pblancNo}, ${n.panId}, ${n.origNoticeKey},
      ${n.name}, ${n.status}, ${n.regionCode}, ${n.regionName}, ${n.address}, ${n.totalSupply},
      ${n.noticeDate}, ${n.receiptBegin}, ${n.receiptEnd}, ${n.winnerDate}, ${n.contractBegin}, ${n.contractEnd}, ${n.moveInYm},
      ${n.homepage}, ${n.noticeUrl}, ${n.developer}, ${n.constructor}, ${n.tel},
      ${locationSql(n.lat, n.lng)}, ${JSON.stringify(n.rawJson)}::jsonb, NOW()
    )
    ON CONFLICT ("source", "sourceKey") DO UPDATE SET
      "category" = EXCLUDED."category",
      "houseManageNo" = EXCLUDED."houseManageNo",
      "pblancNo" = EXCLUDED."pblancNo",
      "panId" = EXCLUDED."panId",
      "origNoticeKey" = EXCLUDED."origNoticeKey",
      "name" = EXCLUDED."name",
      "status" = EXCLUDED."status",
      "regionCode" = EXCLUDED."regionCode",
      "regionName" = EXCLUDED."regionName",
      "address" = EXCLUDED."address",
      "totalSupply" = EXCLUDED."totalSupply",
      "noticeDate" = EXCLUDED."noticeDate",
      "receiptBegin" = EXCLUDED."receiptBegin",
      "receiptEnd" = EXCLUDED."receiptEnd",
      "winnerDate" = EXCLUDED."winnerDate",
      "contractBegin" = EXCLUDED."contractBegin",
      "contractEnd" = EXCLUDED."contractEnd",
      "moveInYm" = EXCLUDED."moveInYm",
      "homepage" = EXCLUDED."homepage",
      "noticeUrl" = EXCLUDED."noticeUrl",
      "developer" = EXCLUDED."developer",
      "constructor" = EXCLUDED."constructor",
      "tel" = EXCLUDED."tel",
      "location" = EXCLUDED."location",
      "rawJson" = EXCLUDED."rawJson",
      "updatedAt" = NOW()
    RETURNING "id"
  `;
  return rows[0].id;
}

// 공고 1건 + 주택형별 저장. 주택형별은 매 수집마다 전량 교체(delete→insert).
export async function upsertNoticeWithUnits(item: NoticeWithUnits): Promise<void> {
  const noticeId = await upsertNotice(item.notice);
  await prisma.subscriptionUnit.deleteMany({ where: { noticeId } });
  if (item.units.length === 0) return;
  // (modelNo, houseType) 중복 제거 — unique 제약 위반 방지
  const seen = new Set<string>();
  const unique = item.units.filter((u) => {
    const k = `${u.modelNo ?? ''}|${u.houseType ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await prisma.subscriptionUnit.createMany({
    data: unique.map((u) => ({
      noticeId,
      modelNo: u.modelNo,
      houseType: u.houseType,
      area: u.area,
      generalSupply: u.generalSupply,
      specialSupply: u.specialSupply,
      topAmount: u.topAmount,
      rawJson: u.rawJson as Prisma.InputJsonValue,
    })),
  });
}
