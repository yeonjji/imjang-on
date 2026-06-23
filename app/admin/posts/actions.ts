'use server';
import { revalidatePath } from 'next/cache';
import { redirect, notFound } from 'next/navigation';
import type { PostType, PostCategory } from '@prisma/client';
import { publishPostRow, rejectPostRow, updatePostRow, deletePostRow } from '@/lib/board/admin';
import { env } from '@/lib/env';
import { prisma } from '@/lib/db';
import { createOpenAiClient, generateDraft } from '@/lib/board/generate';
import { createDraft } from '@/lib/board/create-draft';
import { researchTopic, type SourceMeta } from '@/lib/board/research';
import { manualDedupeKey, manualSlug, kstDateISO } from '@/lib/board/manual-draft';

/** 폼의 id를 BigInt로 파싱한다. 누락/비정상이면 404(잘못된 요청에 500 대신 깔끔히 종료). */
function parseId(fd: FormData): bigint {
  try {
    return BigInt(String(fd.get('id')));
  } catch {
    notFound();
  }
}

function readFields(fd: FormData) {
  return {
    title: String(fd.get('title') ?? '').trim(),
    summary: String(fd.get('summary') ?? '').trim(),
    body: String(fd.get('body') ?? ''),
    type: String(fd.get('type') ?? 'PROGRAM') as PostType,
    category: String(fd.get('category') ?? 'FINANCE') as PostCategory,
  };
}

/** 수정 내용만 저장하고 편집 화면에 머문다. useActionState용 서명. */
export async function savePostAction(
  _prev: { ok: boolean } | null,
  fd: FormData,
): Promise<{ ok: boolean }> {
  let id: bigint;
  try {
    id = BigInt(String(fd.get('id')));
  } catch {
    return { ok: false };
  }
  try {
    await updatePostRow(id, readFields(fd));
    revalidatePath(`/admin/posts/${String(id)}`);
    revalidatePath('/admin/posts');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** 수정 내용 저장 후 게시 → 공개 경로 revalidate → 목록으로. */
export async function publishPostAction(fd: FormData) {
  const id = parseId(fd);
  await updatePostRow(id, readFields(fd));
  await publishPostRow(id);
  revalidatePath('/board');
  // 상세 경로는 id 기반(ASCII)이라 해당 글만 정확히 revalidate한다.
  revalidatePath(`/board/${id}`);
  revalidatePath('/admin/posts');
  redirect('/admin/posts');
}

export async function rejectPostAction(fd: FormData) {
  const id = parseId(fd);
  await rejectPostRow(id);
  revalidatePath('/admin/posts');
  redirect('/admin/posts');
}

export async function deletePostAction(fd: FormData) {
  const id = parseId(fd);
  await deletePostRow(id);
  revalidatePath('/admin/posts');
  revalidatePath('/board');
  redirect('/admin/posts');
}

export type TopicGenResult =
  | { status: 'created'; id: string }
  | { status: 'insufficient'; sources: SourceMeta[] }
  | { status: 'rejected'; violations: string[] }
  | { status: 'duplicate' }
  | { status: 'config_error' }
  | { status: 'error'; message: string };

/**
 * 주제를 받아 공공저작물 근거로 초안(DRAFT) 1건 생성. useActionState용 시그니처.
 * - topic은 검색어로만 쓰이고 generateDraft 프롬프트엔 전달하지 않는다(근거=수집 sourceText뿐).
 * - 근거 부족 시 status='insufficient' → 폼이 붙여넣기 폴백 노출.
 */
export async function generateFromTopicAction(
  _prev: TopicGenResult | null,
  fd: FormData,
): Promise<TopicGenResult> {
  if (!env.OPENAI_API_KEY) return { status: 'config_error' };

  const topic = String(fd.get('topic') ?? '').trim();
  if (!topic) return { status: 'error', message: '주제를 입력하세요.' };

  const pasted = String(fd.get('pastedSource') ?? '').trim();
  const pastedName = String(fd.get('pastedSourceName') ?? '').trim();
  const pastedUrl = String(fd.get('pastedSourceUrl') ?? '').trim();

  const now = new Date();
  const dateISO = kstDateISO(now);
  const dedupeKey = manualDedupeKey(topic, dateISO);

  try {
    let sourceName: string;
    let sourceUrl: string;
    let sourceDate: Date;
    let sourceText: string;
    let sourceExcerpt: string;

    if (pasted) {
      if (!pastedName || !pastedUrl) {
        return { status: 'error', message: '붙여넣기 시 출처 기관명과 URL을 함께 입력하세요.' };
      }
      sourceName = pastedName;
      sourceUrl = pastedUrl;
      sourceDate = now;
      sourceText = pasted;
      sourceExcerpt = `[출처: ${pastedName} · ${pastedUrl}]\n${pasted}`.slice(0, 4000);
    } else {
      const r = await researchTopic(topic, now);
      if (!r.grounded) return { status: 'insufficient', sources: r.candidates };
      sourceName = r.grounded.sourceName;
      sourceUrl = r.grounded.sourceUrl;
      sourceDate = r.grounded.sourceDate;
      sourceText = r.grounded.sourceText;
      sourceExcerpt = r.grounded.sourceExcerpt;
    }

    const client = createOpenAiClient(env.OPENAI_API_KEY);
    const gen = await generateDraft(client, { sourceText, sourceName }, 'gpt-4.1');

    const res = await createDraft({
      gen,
      sourceName,
      sourceUrl,
      sourceDate,
      sourceExcerpt,
      dedupeKey,
      dateISO,
      detectedFrom: `topic:${manualSlug(topic)}`,
    });

    if (res.status === 'created') {
      const row = await prisma.post.findUnique({ where: { dedupeKey }, select: { id: true } });
      revalidatePath('/admin/posts');
      return { status: 'created', id: String(row!.id) };
    }
    if (res.status === 'duplicate') return { status: 'duplicate' };
    return { status: 'rejected', violations: res.violations };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : '생성 실패' };
  }
}
