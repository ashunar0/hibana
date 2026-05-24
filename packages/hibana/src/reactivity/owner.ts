let currentOwner: Owner | null = null;

export class Owner {
  parent: Owner | null;
  children: Owner[] = [];
  cleanups: (() => void)[] = [];
  disposed = false;

  constructor(parent: Owner | null = currentOwner) {
    this.parent = parent;
    if (parent) parent.children.push(this);
  }

  addCleanup(fn: () => void): void {
    if (this.disposed) {
      // disposed 済み owner への登録は即時実行が安全 (リーク防止)
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
      return;
    }
    this.cleanups.push(fn);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // 子孫を先に dispose (depth-first, 後行順)
    for (const child of this.children) child.dispose();
    this.children = [];

    // cleanup は LIFO で呼ぶ (Solid 流: 後から登録したものが先に解除)
    for (let i = this.cleanups.length - 1; i >= 0; i--) {
      try {
        this.cleanups[i]();
      } catch (e) {
        console.error(e);
      }
    }
    this.cleanups = [];

    if (this.parent && !this.parent.disposed) {
      const idx = this.parent.children.indexOf(this);
      if (idx >= 0) this.parent.children.splice(idx, 1);
    }
    this.parent = null;
  }
}

export function getCurrentOwner(): Owner | null {
  return currentOwner;
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } finally {
    currentOwner = prev;
  }
}

export function addCleanupToCurrentOwner(fn: () => void): void {
  // owner なしの場合は no-op (§5: module scope effect は owner なしで永遠に生きる)
  currentOwner?.addCleanup(fn);
}
