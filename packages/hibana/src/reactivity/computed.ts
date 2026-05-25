import {
  CHECK,
  CLEAN,
  DIRTY,
  type State,
  type Subject,
  type Subscriber,
  clearDependencies,
  getCurrentSubscriber,
  notifySubscribers,
  runWithSubscriber,
  track,
} from "./tracking.ts";

// Computed<T> は他 signal から計算される derived signal (read-only)。
// 3-state push-CHECK / pull-confirm:
// - Signal.set → 直 subscribers に DIRTY、 さらに downstream に CHECK 伝播 (確定はしない)
// - CHECK を受けた Computed/Effect は read/run 時に dependencies を walk して各
//   Computed dep の update() を呼び、 値が変化したら DIRTY 昇格、 全 dep 同値なら CLEAN 復帰
// - #recompute は値が変化した (or error 状態が変わった) ときだけ subscribers に DIRTY を流す
//   = 同値 derived では downstream effect を flush しない (= glitch-free + same-value skip)
export class Computed<T> implements Subject, Subscriber {
  subscribers = new Set<Subscriber>();
  dependencies = new Set<Subject>();

  #fn: () => T;
  #value!: T;
  #state: State = DIRTY;
  #hasError = false;
  #error: unknown = undefined;

  constructor(compute: () => T) {
    this.#fn = compute;
  }

  get value(): T {
    this.#updateIfNecessary();
    track(this);
    if (this.#hasError) throw this.#error;
    return this.#value;
  }

  peek(): T {
    this.#updateIfNecessary();
    if (this.#hasError) throw this.#error;
    return this.#value;
  }

  /** Subject.update: CHECK 状態の subscriber が dep walk で呼ぶ。 必要なら自身を resolve */
  update(): void {
    this.#updateIfNecessary();
  }

  notify(state: State): void {
    if (this.#state >= state) return;
    const wasClean = this.#state === CLEAN;
    this.#state = state;
    if (wasClean) {
      // CLEAN → CHECK/DIRTY 遷移時のみ downstream に CHECK を伝播。
      // recompute 後に値変化が確定したら #recompute() 側で改めて DIRTY を流す。
      notifySubscribers(this, CHECK);
    }
  }

  #updateIfNecessary(): void {
    if (this.#state === CLEAN) return;
    if (this.#state === CHECK) {
      // dep walk: 各 derived dep を解決、 値変化があれば self が DIRTY 昇格する
      for (const dep of this.dependencies) {
        dep.update?.();
        if ((this.#state as State) === DIRTY) break;
      }
      if ((this.#state as State) === CHECK) {
        // 全 dep 同値だった → 自身も CLEAN に戻して終了
        this.#state = CLEAN;
        return;
      }
    }
    this.#recompute();
  }

  #recompute(): void {
    const prev = this.#value;
    const hadError = this.#hasError;
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
    this.#state = CLEAN;

    // 値 / error 状態が変わったときだけ downstream に DIRTY を流す。
    // 現在 read 中の subscriber は除外 (= self を読んでる effect に自分から再 schedule を送らない)
    const changed = this.#hasError !== hadError || this.#hasError || !Object.is(prev, this.#value);
    if (changed) {
      notifySubscribers(this, DIRTY, getCurrentSubscriber());
    }
  }
}
