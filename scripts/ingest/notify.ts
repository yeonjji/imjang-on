import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

export async function notify(
  level: 'info' | 'warn' | 'error',
  message: string,
  ctx?: Record<string, unknown>,
): Promise<void> {
  if (!env.DISCORD_WEBHOOK_URL) {
    logger.info({ level, message, ctx }, 'notify (no webhook configured)');
    return;
  }
  const emoji = level === 'error' ? '🔴' : level === 'warn' ? '🟡' : '🟢';
  const body = {
    content: ctx
      ? `${emoji} **[${level.toUpperCase()}]** ${message}\n\`\`\`json\n${JSON.stringify(ctx, null, 2).slice(0, 1800)}\n\`\`\``
      : `${emoji} **[${level.toUpperCase()}]** ${message}`,
  };
  try {
    await fetch(env.DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    logger.warn({ err: e }, 'discord notify failed');
  }
}
