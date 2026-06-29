'use server';
import { revalidatePath } from 'next/cache';
import { redirect, notFound } from 'next/navigation';
import type { GuideCategory } from '@prisma/client';
import { publishGuideRow, rejectGuideRow, updateGuideRow, deleteGuideRow } from '@/lib/guide/admin';

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
    category: String(fd.get('category') ?? 'REALESTATE') as GuideCategory,
  };
}

export async function saveGuideAction(_prev: { ok: boolean } | null, fd: FormData): Promise<{ ok: boolean }> {
  let id: bigint;
  try {
    id = BigInt(String(fd.get('id')));
  } catch {
    return { ok: false };
  }
  try {
    await updateGuideRow(id, readFields(fd));
    revalidatePath(`/admin/guides/${String(id)}`);
    revalidatePath('/admin/guides');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function publishGuideAction(fd: FormData) {
  const id = parseId(fd);
  await updateGuideRow(id, readFields(fd));
  const { slug } = await publishGuideRow(id);
  revalidatePath('/guide');
  revalidatePath(`/guide/${slug}`);
  revalidatePath('/admin/guides');
  redirect('/admin/guides');
}

export async function rejectGuideAction(fd: FormData) {
  const id = parseId(fd);
  await rejectGuideRow(id);
  revalidatePath('/admin/guides');
  redirect('/admin/guides');
}

export async function deleteGuideAction(fd: FormData) {
  const id = parseId(fd);
  await deleteGuideRow(id);
  revalidatePath('/admin/guides');
  revalidatePath('/guide');
  redirect('/admin/guides');
}
