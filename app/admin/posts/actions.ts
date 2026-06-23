'use server';
import { revalidatePath } from 'next/cache';
import { redirect, notFound } from 'next/navigation';
import type { PostType, PostCategory } from '@prisma/client';
import { publishPostRow, rejectPostRow, updatePostRow, deletePostRow } from '@/lib/board/admin';

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
