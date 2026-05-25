import { expect, test } from "vite-plus/test";
import { effect } from "../../src/reactivity/effect.ts";
import { Resource } from "../../src/reactivity/resource.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function nextMicrotasks(n = 1): Promise<void> {
  return new Promise((res) => {
    let i = 0;
    const tick = () => {
      if (++i >= n) res();
      else void Promise.resolve().then(tick);
    };
    tick();
  });
}

test("initial state: loading=true, value=undefined, error=null", () => {
  const r = new Resource(() => new Promise(() => {})); // never resolves
  expect(r.loading).toBe(true);
  expect(r.value).toBeUndefined();
  expect(r.error).toBeNull();
});

test("resolved: loading=false, value=<resolved>", async () => {
  const r = new Resource(() => Promise.resolve(42));
  await nextMicrotasks(2);
  expect(r.loading).toBe(false);
  expect(r.value).toBe(42);
  expect(r.error).toBeNull();
});

test("rejected: loading=false, error=<Error>", async () => {
  const r = new Resource(() => Promise.reject(new Error("boom")));
  await nextMicrotasks(2);
  expect(r.loading).toBe(false);
  expect(r.error?.message).toBe("boom");
  expect(r.value).toBeUndefined();
});

test("synchronous throw in fetcher is caught as error", () => {
  const r = new Resource<number>(() => {
    throw new Error("sync");
  });
  expect(r.loading).toBe(false);
  expect(r.error?.message).toBe("sync");
});

test("refetch() re-runs fetcher and updates value", async () => {
  let runs = 0;
  const r = new Resource(() => Promise.resolve(++runs));
  await nextMicrotasks(2);
  expect(r.value).toBe(1);

  r.refetch();
  flushSync(); // effect scheduled by trigger.value++
  await nextMicrotasks(2);
  expect(r.value).toBe(2);
  expect(runs).toBe(2);
});

test("auto-refetch when dep signal in fetcher changes", async () => {
  const id = new Signal(1);
  let runs = 0;
  const r = new Resource(() => {
    runs++;
    return Promise.resolve(`user-${id.value}`);
  });
  await nextMicrotasks(2);
  expect(r.value).toBe("user-1");
  expect(runs).toBe(1);

  id.value = 5;
  flushSync();
  await nextMicrotasks(2);
  expect(r.value).toBe("user-5");
  expect(runs).toBe(2);
});

test("race condition: stale promise resolve is discarded", async () => {
  const first = deferred<number>();
  const second = deferred<number>();
  let call = 0;
  const r = new Resource(() => {
    call++;
    return call === 1 ? first.promise : second.promise;
  });

  // 2 回目を即座に開始 (version が 1 → 2 に)
  r.refetch();
  flushSync();
  expect(call).toBe(2);

  // 2 回目 resolve → value=200
  second.resolve(200);
  await nextMicrotasks(2);
  expect(r.value).toBe(200);

  // 1 回目 (古い) resolve は捨てられる
  first.resolve(100);
  await nextMicrotasks(2);
  expect(r.value).toBe(200);
});

test("race condition: stale promise reject is discarded", async () => {
  const first = deferred<number>();
  const second = deferred<number>();
  let call = 0;
  const r = new Resource(() => (++call === 1 ? first.promise : second.promise));

  r.refetch();
  flushSync();

  second.resolve(99);
  await nextMicrotasks(2);
  expect(r.value).toBe(99);
  expect(r.error).toBeNull();

  first.reject(new Error("late"));
  await nextMicrotasks(2);
  expect(r.error).toBeNull();
  expect(r.value).toBe(99);
});

test("peek() reads value without registering dependency", async () => {
  const r = new Resource(() => Promise.resolve(7));
  await nextMicrotasks(2);

  let runs = 0;
  effect(() => {
    void r.peek();
    runs++;
  });
  expect(runs).toBe(1);

  r.refetch();
  flushSync();
  await nextMicrotasks(2);
  // peek だから effect は再 run しない
  expect(runs).toBe(1);
});

test("integration: effect reading .value reruns on resolution", async () => {
  const r = new Resource(() => Promise.resolve(100));
  const seen: (number | undefined)[] = [];
  effect(() => {
    seen.push(r.value);
  });
  // initial run: undefined
  expect(seen).toEqual([undefined]);

  await nextMicrotasks(2);
  flushSync();
  expect(seen).toEqual([undefined, 100]);
});

// ---- .mutate(newValue) ----

test("mutate(newValue) replaces cache, resets loading/error", async () => {
  const r = new Resource(() => Promise.resolve(1));
  await nextMicrotasks(2);
  expect(r.value).toBe(1);

  r.mutate(99);
  expect(r.value).toBe(99);
  expect(r.loading).toBe(false);
  expect(r.error).toBeNull();
});

test("mutate() discards in-flight fetch resolve (no overwrite)", async () => {
  const pending = deferred<number>();
  const r = new Resource(() => pending.promise);
  expect(r.loading).toBe(true);

  // 楽観的更新: cache を即書き換え
  r.mutate(42);
  expect(r.value).toBe(42);
  expect(r.loading).toBe(false);

  // 後から fetch が resolve しても値は上書きされない
  pending.resolve(1);
  await nextMicrotasks(2);
  expect(r.value).toBe(42);
});

test("mutate(newValue) triggers reactive read", async () => {
  const r = new Resource(() => Promise.resolve(10));
  await nextMicrotasks(2);

  const seen: (number | undefined)[] = [];
  effect(() => {
    seen.push(r.value);
  });
  expect(seen).toEqual([10]);

  r.mutate(20);
  flushSync();
  expect(seen).toEqual([10, 20]);
});
