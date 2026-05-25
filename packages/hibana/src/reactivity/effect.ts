import { Owner, addCleanupToCurrentOwner, getCurrentOwner, runWithOwner } from "./owner.ts";
import { type Schedulable, schedule } from "./scheduler.ts";
import {
  CHECK,
  CLEAN,
  DIRTY,
  type State,
  type Subject,
  type Subscriber,
  clearDependencies,
  runWithSubscriber,
} from "./tracking.ts";

class Effect implements Subscriber, Schedulable {
  dependencies = new Set<Subject>();
  innerOwner: Owner;
  disposed = false;
  #fn: () => void;
  #state: State = DIRTY;

  constructor(fn: () => void) {
    this.#fn = fn;
    // effect の lifetime は親 owner に紐づく。親が dispose されると自分も dispose
    // (§5: 親 unmount → 子 effect 自動 cleanup)。module scope (親なし) は永遠に生きる
    const parentOwner = getCurrentOwner();
    parentOwner?.addCleanup(() => this.dispose());
    // inner owner は parent と切り離した独立 tree。run() のたびに作り直して onCleanup を flush
    this.innerOwner = new Owner(null);
  }

  run(): void {
    if (this.disposed) return;
    if (this.#state === CLEAN) return;

    if (this.#state === CHECK) {
      // dep walk: 各 Computed dep を resolve、 値変化があれば自身が DIRTY 昇格する
      for (const dep of this.dependencies) {
        dep.update?.();
        if ((this.#state as State) === DIRTY) break;
      }
      if ((this.#state as State) === CHECK) {
        // 全 dep 同値 → run skip して CLEAN 復帰
        this.#state = CLEAN;
        return;
      }
    }

    // state === DIRTY: 通常 run
    this.#state = CLEAN;

    // 前回 run の onCleanup を flush + 旧 inner owner 破棄
    this.innerOwner.dispose();
    this.innerOwner = new Owner(null);

    // 動的依存追跡: 旧 dependencies を全部外して新規に張り直す
    clearDependencies(this);

    runWithSubscriber(this, () => {
      runWithOwner(this.innerOwner, () => {
        try {
          this.#fn();
        } catch (e) {
          console.error(e);
        }
      });
    });
  }

  notify(state: State): void {
    if (this.disposed) return;
    if (this.#state >= state) return;
    this.#state = state;
    schedule(this);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.innerOwner.dispose();
    clearDependencies(this);
  }
}

export function effect(fn: () => void): void {
  const e = new Effect(fn);
  e.run();
}

export function onCleanup(fn: () => void): void {
  addCleanupToCurrentOwner(fn);
}

// untrack: scope 単位で tracking を抑制 (signal read の依存登録を全て無視)。
// `.peek()` が 1 signal 単位、 untrack はスコープ単位の対称 API (設計書 §4.6)。
export function untrack<T>(fn: () => T): T {
  return runWithSubscriber(null, fn);
}

// onMount: mount 後に 1 回だけ実行、 client only (SSR では skip、 設計書 §5)。
// 「mount 後」 は MVP では microtask 境界で代用 (component 構築 → microtask → DOM 反映後)。
// owner が dispose 済みなら fn を呼ばない (unmount 直後の取りこぼし防止)。
// fn 内の signal read は依存登録しない (再 run しないので tracking する意味がない)。
export function onMount(fn: () => void): void {
  if (typeof window === "undefined") return;
  const owner = getCurrentOwner();
  queueMicrotask(() => {
    if (owner?.disposed) return;
    runWithSubscriber(null, () => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  });
}
