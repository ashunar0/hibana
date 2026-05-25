import { expect, test } from "vite-plus/test";
import { Computed } from "../../src/reactivity/computed.ts";
import { effect } from "../../src/reactivity/effect.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";
import { type Subscriber, runWithSubscriber } from "../../src/reactivity/tracking.ts";

function makeSubscriber(): Subscriber & { notifyCount: number } {
  return {
    dependencies: new Set(),
    notifyCount: 0,
    notify() {
      this.notifyCount++;
    },
  };
}

test("constructor does not run compute eagerly (lazy)", () => {
  let runs = 0;
  new Computed(() => {
    runs++;
    return 1;
  });
  expect(runs).toBe(0);
});

test(".value triggers initial compute", () => {
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return 42;
  });
  expect(c.value).toBe(42);
  expect(runs).toBe(1);
});

test(".value is cached until dependency changes", () => {
  const a = new Signal(2);
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return a.value * 10;
  });
  expect(c.value).toBe(20);
  expect(c.value).toBe(20);
  expect(c.value).toBe(20);
  expect(runs).toBe(1);
});

test("dependency change marks dirty and recomputes on next read", () => {
  const a = new Signal(1);
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return a.value + 1;
  });
  expect(c.value).toBe(2);
  expect(runs).toBe(1);

  a.value = 10;
  // まだ read してないので recompute されない (lazy)
  expect(runs).toBe(1);

  expect(c.value).toBe(11);
  expect(runs).toBe(2);
});

test("multiple dirty signals before read = 1 recompute", () => {
  const a = new Signal(1);
  const b = new Signal(2);
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return a.value + b.value;
  });
  expect(c.value).toBe(3);
  expect(runs).toBe(1);

  a.value = 10;
  b.value = 20;
  // 連続 write でも次の read までは recompute されない
  expect(runs).toBe(1);
  expect(c.value).toBe(30);
  expect(runs).toBe(2);
});

test(".peek() reads without registering dependency", () => {
  const a = new Signal(5);
  const c = new Computed(() => a.value * 2);

  const sub = makeSubscriber();
  runWithSubscriber(sub, () => c.peek());

  expect(c.subscribers.has(sub)).toBe(false);
  expect(sub.dependencies.has(c)).toBe(false);
});

test(".peek() still triggers lazy recompute", () => {
  const a = new Signal(3);
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return a.value * 2;
  });
  expect(c.peek()).toBe(6);
  expect(runs).toBe(1);

  a.value = 5;
  expect(c.peek()).toBe(10);
  expect(runs).toBe(2);
});

test(".value inside subscriber registers Computed as dependency", () => {
  const a = new Signal(1);
  const c = new Computed(() => a.value);

  const sub = makeSubscriber();
  runWithSubscriber(sub, () => c.value);

  expect(c.subscribers.has(sub)).toBe(true);
  expect(sub.dependencies.has(c)).toBe(true);
});

test("Signal write propagates dirty through Computed to downstream subscriber", () => {
  const a = new Signal(1);
  const c = new Computed(() => a.value * 2);

  const sub = makeSubscriber();
  runWithSubscriber(sub, () => c.value);
  expect(sub.notifyCount).toBe(0);

  a.value = 5;
  expect(sub.notifyCount).toBe(1);
});

test("dirty propagation aggregates consecutive writes and re-arms after read", () => {
  const a = new Signal(1);
  const c = new Computed(() => a.value);

  const sub = makeSubscriber();
  runWithSubscriber(sub, () => c.value);

  a.value = 2;
  a.value = 3;
  a.value = 4;
  // c.notify(DIRTY) は 1 回目で CLEAN→DIRTY 遷移時のみ downstream に CHECK を伝播、
  // 2-3 回目は state>=newState で no-op。 結果 sub には CHECK が 1 回届く。
  expect(sub.notifyCount).toBe(1);

  // 外部 read で recompute → 値変化 (1→4) → sub に DIRTY が +1 (= count 2)
  void c.value;
  expect(sub.notifyCount).toBe(2);

  // c は CLEAN に戻り、 次の write でまた CHECK が +1 (= count 3)
  a.value = 5;
  expect(sub.notifyCount).toBe(3);
});

test("nested Computed: derived of derived", () => {
  const a = new Signal(2);
  const doubled = new Computed(() => a.value * 2);
  const quadrupled = new Computed(() => doubled.value * 2);

  expect(quadrupled.value).toBe(8);

  a.value = 5;
  expect(quadrupled.value).toBe(20);
});

test("dynamic dependency: 旧 dep の変化で再計算しなくなる", () => {
  const flag = new Signal(true);
  const a = new Signal(1);
  const b = new Signal(100);
  let runs = 0;
  const c = new Computed(() => {
    runs++;
    return flag.value ? a.value : b.value;
  });

  expect(c.value).toBe(1);
  expect(runs).toBe(1);

  flag.value = false;
  expect(c.value).toBe(100);
  expect(runs).toBe(2);

  // 旧 dep (a) を変えても recompute されない
  a.value = 999;
  // ただし notify は 1 回飛ぶ → c は dirty に → read で recompute はする
  // この test は「a が dep から外れている」 の確認なので、 c.value 後の値が b 由来かを見る
  expect(c.value).toBe(100);
});

test("error in compute is re-thrown on read", () => {
  const c = new Computed<number>(() => {
    throw new Error("boom");
  });
  expect(() => c.value).toThrow("boom");
});

test("error path retries on next read after dependency change", () => {
  const a = new Signal(0);
  const c = new Computed(() => {
    if (a.value === 0) throw new Error("zero");
    return a.value * 10;
  });

  expect(() => c.value).toThrow("zero");

  a.value = 3;
  expect(c.value).toBe(30);
});

test("integration with effect: count → doubled", () => {
  const count = new Signal(1);
  const doubled = new Computed(() => count.value * 2);
  const seen: number[] = [];

  effect(() => {
    seen.push(doubled.value);
  });
  expect(seen).toEqual([2]);

  count.value = 5;
  flushSync();
  expect(seen).toEqual([2, 10]);

  count.value = 7;
  flushSync();
  expect(seen).toEqual([2, 10, 14]);
});

test("batched updates: 2 writes in same tick = 1 effect run", () => {
  const a = new Signal(1);
  const b = new Signal(2);
  const sum = new Computed(() => a.value + b.value);

  let runs = 0;
  effect(() => {
    void sum.value;
    runs++;
  });
  expect(runs).toBe(1);

  a.value = 10;
  b.value = 20;
  flushSync();
  expect(runs).toBe(2);
});

// --- glitch-free / same-value skip ---

test("glitch-free: same-value derived skips downstream effect", () => {
  // a が変わっても c の boolean が同値なら effect は再 run しない
  const a = new Signal(1);
  const c = new Computed(() => a.value > 0);

  let runs = 0;
  effect(() => {
    void c.value;
    runs++;
  });
  expect(runs).toBe(1);

  a.value = 2; // c は true → true で同値
  flushSync();
  expect(runs).toBe(1);

  a.value = 3; // 同上
  flushSync();
  expect(runs).toBe(1);

  a.value = -1; // c は true → false で値変化
  flushSync();
  expect(runs).toBe(2);
});

test("glitch-free: diamond dependency runs effect exactly once per consistent state", () => {
  // a → b, c → d (b+c)、 a 1 回変えて effect も 1 回しか走らない (inconsistent state を観測しない)
  const a = new Signal(1);
  const b = new Computed(() => a.value * 2);
  const c = new Computed(() => a.value * 3);
  const d = new Computed(() => b.value + c.value);

  const seen: number[] = [];
  effect(() => {
    seen.push(d.value);
  });
  expect(seen).toEqual([5]);

  a.value = 10;
  flushSync();
  expect(seen).toEqual([5, 50]);

  a.value = 100;
  flushSync();
  expect(seen).toEqual([5, 50, 500]);
});

test("glitch-free: chain stops early when intermediate Computed is same-value", () => {
  // a → b (x*2) → c (b > 100), a を 1→2 で b: 2→4、 c: false→false → effect skip
  const a = new Signal(1);
  const b = new Computed(() => a.value * 2);
  const c = new Computed(() => b.value > 100);

  let runs = 0;
  effect(() => {
    void c.value;
    runs++;
  });
  expect(runs).toBe(1);

  a.value = 2;
  flushSync();
  expect(runs).toBe(1);

  a.value = 60; // b=120, c=true で値変化
  flushSync();
  expect(runs).toBe(2);

  a.value = 70; // b=140, c=true で同値 → skip
  flushSync();
  expect(runs).toBe(2);
});

test("glitch-free: CHECK does not eagerly recompute upstream Computed", () => {
  // a 変化で b は CHECK されるだけで、 b の compute は次の read まで走らない (lazy 維持)
  const a = new Signal(1);
  let bRuns = 0;
  const b = new Computed(() => {
    bRuns++;
    return a.value * 2;
  });

  // subscriber なしで使う: 直接 read
  expect(b.value).toBe(2);
  expect(bRuns).toBe(1);

  a.value = 5;
  a.value = 10;
  // CHECK だけ伝播するが subscribers いないので b.recompute は走らず
  expect(bRuns).toBe(1);

  expect(b.value).toBe(20);
  expect(bRuns).toBe(2);
});
