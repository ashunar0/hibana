// in-memory like store。 起動ごとリセット (= MVP、 SQLite 等は YAGNI 持ち越し)。
// slug をキーに count を保持、 incrementLike で +1 して新値返す。
const LIKES = new Map<string, number>();

export function getLikes(slug: string): number {
  return LIKES.get(slug) ?? 0;
}

export function incrementLike(slug: string): number {
  const next = (LIKES.get(slug) ?? 0) + 1;
  LIKES.set(slug, next);
  return next;
}
