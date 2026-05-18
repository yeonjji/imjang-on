export function normalizeName(input: string): string {
  return input
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\s\-_·.,/()[\]'"!?]+/g, '');
}
