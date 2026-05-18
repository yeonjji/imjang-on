import { revalidatePath, revalidateTag } from 'next/cache';

export function revalidatePropertyPaths(paths: string[]) {
  for (const p of paths) revalidatePath(p);
}

export function revalidateRegionTag(code: string) {
  revalidateTag(`region:${code}`);
}
