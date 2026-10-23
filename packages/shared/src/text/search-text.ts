/**
 * Accent-free, lower-case form used for `searchText` and for matching what people type:
 * "Đường Trần Quang Khải" → "duong tran quang khai". Punctuation becomes single spaces.
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
