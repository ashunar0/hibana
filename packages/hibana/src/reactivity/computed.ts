import {
  type Subject,
  type Subscriber,
  clearDependencies,
  notifySubscribers,
  runWithSubscriber,
  track,
} from "./tracking.ts";

// Computed<T> は他 signal から計算される derived signal (read-only)。
// lazy: dirty flag + read 時に再計算 / push: dependency notify で dirty 伝播。
// 同値ガード (Object.is) で downstream notify を skip する厳密 glitch-free は Phase 2、
// MVP は dirty propagation のみで「effect が無駄に 1 回 run するが副作用は同じ」 挙動。
export class Computed<T> implements Subject, Subscriber {
  subscribers = new Set<Subscriber>();
  dependencies = new Set<Subject>();

  #fn: () => T;
  #value!: T;
  #dirty = true;
  #hasError = false;
  #error: unknown = undefined;

  constructor(compute: () => T) {
    this.#fn = compute;
  }

  get value(): T {
    track(this);
    if (this.#dirty) this.#recompute();
    if (this.#hasError) throw this.#error;
    return this.#value;
  }

  peek(): T {
    if (this.#dirty) this.#recompute();
    if (this.#hasError) throw this.#error;
    return this.#value;
  }

  notify(): void {
    if (this.#dirty) return;
    this.#dirty = true;
    notifySubscribers(this);
  }

  #recompute(): void {
    this.#dirty = false;
    clearDependencies(this);
    this.#hasError = false;
    this.#error = undefined;

    runWithSubscriber(this, () => {
      try {
        this.#value = this.#fn();
      } catch (e) {
        this.#hasError = true;
        this.#error = e;
      }
    });
  }
}
