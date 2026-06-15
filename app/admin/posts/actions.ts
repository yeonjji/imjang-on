'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { PostType, PostCategory } from '@prisma/client';
import { publishPostRow, rejectPostRow, updatePostRow, deletePostRow } from '@/lib/board/admin';

function readFields(fd: FormData) {
  return {
    title: String(fd.get('title') ?? '').trim(),
    summary: String(fd.get('summary') ?? '').trim(),
    body: String(fd.get('body') ?? ''),
    type: String(fd.get('type') ?? 'PROGRAM') as PostType,
    category: String(fd.get('category') ?? 'FINANCE') as PostCategory,
  };
}

/** 수정 내용만 저장하고 편집 화면에 머문다. */
export async function savePostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await updatePostRow(id, readFields(fd));
  revalidatePath(`/admin/posts/${id}`);
  revalidatePath('/admin/posts');
}

/** 수정 내용 저장 후 게시 → 공개 경로 revalidate → 목록으로. */
export async function publishPostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await updatePostRow(id, readFields(fd));
  const { slug } = await publishPostRow(id);
  revalidatePath('/board');
  revalidatePath(`/board/${slug}`);
  revalidatePath('/admin/posts');
  redirect('/admin/posts');
}

export async function rejectPostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await rejectPostRow(id);
  revalidatePath('/admin/posts');
  redirect('/admin/posts');
}

export async function deletePostAction(fd: FormData) {
  const id = BigInt(String(fd.get('id')));
  await deletePostRow(id);
  revalidatePath('/admin/posts');
  revalidatePath('/board');
  redirect('/admin/posts');
}
