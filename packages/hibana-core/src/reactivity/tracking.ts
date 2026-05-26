// 依存追跡の双方向リンク用 interface。
// Signal / Computed が Subject、Effect / Computed が Subscriber。
//
// 3-state state machine (Solid v1 風 push-CHECK / pull-confirm):
// - CLEAN: cached value 有効
// - CHECK: 上流に変化があったかもしれない、 read 時に dependencies を walk して確認 (derived のみ)
// - DIRTY: 確実に再計算 / 再実行が必要
//
// Signal write は subscribers に DIRTY を push。 Computed は受け取った state が
// DIRTY のときのみ自分を DIRTY 化し、 downstream には CHECK を伝播する。
// CHECK を受けた Computed/Effect は read/run 時に dependencies の Computed を
// 解決し、 値が変化した dep が一つでもあれば自身を DIRTY 昇格、 全 dep が同値なら
// CLEAN に戻して downstream を flush しない (= glitch-free + same-value skip)。

export const CLEAN = 0;
export const CHECK = 1;
export const DIRTY = 2;

export type State = typeof CLEAN | typeof CHECK | typeof DIRTY;

export interface Subject {
  subscribers: Set<Subscriber>;
  /** derived subject (Computed 等) の遅延解決。 CHECK 状態の subscriber が呼ぶ。 */
  update?(): void;
}

export interface Subscriber {
  dependencies: Set<Subject>;
  notify(state: State): void;
}

let currentSubscriber: Subscriber | null = null;

export function getCurrentSubscriber(): Subscriber | null {
  return currentSubscriber;
}

export function runWithSubscriber<T>(sub: Subscriber | null, fn: () => T): T {
  const prev = currentSubscriber;
  currentSubscriber = sub;
  try {
    return fn();
  } finally {
    currentSubscriber = prev;
  }
}

export function track(subject: Subject): void {
  const sub = currentSubscriber;
  if (!sub) return;
  subject.subscribers.add(sub);
  sub.dependencies.add(subject);
}

export function clearDependencies(sub: Subscriber): void {
  for (const dep of sub.dependencies) {
    dep.subscribers.delete(sub);
  }
  sub.dependencies.clear();
}

export function notifySubscribers(
  subject: Subject,
  state: State,
  exclude?: Subscriber | null,
): void {
  // notify 中の subscribers 変更 (新規登録 / dispose) に対応するため snapshot で iterate。
  // exclude: 「今この subject を read している subscriber」 を除外する用途。
  // Computed.#recompute が読み手自身に DIRTY を送り返さないようにする (= 同 microtask 内で
  // effect が「自分が dep を読んだ」 だけで再 schedule される事故を防ぐ)。
  const snapshot = [...subject.subscribers];
  for (const sub of snapshot) {
    if (sub === exclude) continue;
    sub.notify(state);
  }
}
