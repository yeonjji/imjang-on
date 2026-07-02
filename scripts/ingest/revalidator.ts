import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

const SITE_URL = process.env.SITE_URL ?? 'https://imjang-on.com';

export async function revalidatePaths(paths: string[]): Promise<void> {
  if (paths.length === 0 || !env.REVALIDATE_TOKEN) return;
  const unique = Array.from(new Set(paths));
  try {
    const res = await fetch(`${SITE_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.REVALIDATE_TOKEN, paths: unique }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'revalidate failed');
    } else {
      logger.info({ count: unique.length }, 'revalidate done');
    }
  } catch (err) {
    logger.warn({ err }, 'revalidate error');
  }
}

export function propertyPath(propertyType: 'APARTMENT' | 'OFFICETEL' | 'ROW_HOUSE' | 'MULTIPLEX', id: bigint): string {
  const prefix =
    propertyType === 'APARTMENT' ? '/apt' : propertyType === 'OFFICETEL' ? '/officetel' : '/villa';
  return `${prefix}/${id}`;
}
