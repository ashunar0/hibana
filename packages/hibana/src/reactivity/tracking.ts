// 依存追跡の双方向リンク用 interface。
// Signal / Computed が Subject、Effect / Computed が Subscriber。

export interface Subject {
  subscribers: Set<Subscriber>;
}

export interface Subscriber {
  dependencies: Set<Subject>;
  notify(): void;
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

export function notifySubscribers(subject: Subject): void {
  // notify 中の subscribers 変更 (新規登録 / dispose) に対応するため snapshot で iterate
  const snapshot = [...subject.subscribers];
  for (const sub of snapshot) sub.notify();
}
