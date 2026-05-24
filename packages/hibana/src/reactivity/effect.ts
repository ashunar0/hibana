import { Owner, addCleanupToCurrentOwner, getCurrentOwner, runWithOwner } from "./owner.ts";
import { type Schedulable, schedule } from "./scheduler.ts";
import { type Subject, type Subscriber, clearDependencies, runWithSubscriber } from "./tracking.ts";

class Effect implements Subscriber, Schedulable {
  dependencies = new Set<Subject>();
  innerOwner: Owner;
  disposed = false;
  #fn: () => void;

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

  notify(): void {
    if (this.disposed) return;
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
