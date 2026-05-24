import { expect, test, vi } from "vite-plus/test";
import { effect, onCleanup } from "../../src/reactivity/effect.ts";
import { Owner, runWithOwner } from "../../src/reactivity/owner.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";

test("effect runs synchronously on creation", () => {
  const fn = vi.fn();
  effect(fn);
  expect(fn).toHaveBeenCalledTimes(1);
});

test("effect re-runs when a tracked signal changes", () => {
  const s = new Signal(0);
  const fn = vi.fn(() => s.value);

  effect(fn);
  expect(fn).toHaveBeenCalledTimes(1);

  s.value = 1;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);
});

test("effect does not re-run on same-value write", () => {
  const s = new Signal(0);
  const fn = vi.fn(() => s.value);
  effect(fn);

  s.value = 0;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("multiple writes in same tick batch into one re-run", () => {
  const a = new Signal(1);
  const b = new Signal(2);
  let sum = 0;
  const fn = vi.fn(() => {
    sum = a.value + b.value;
  });
  effect(fn);
  expect(sum).toBe(3);

  a.value = 10;
  b.value = 20;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);
  expect(sum).toBe(30);
});

test("dynamic dependencies: branches add/remove signals", () => {
  const flag = new Signal(true);
  const a = new Signal("a");
  const b = new Signal("b");
  const fn = vi.fn(() => (flag.value ? a.value : b.value));

  effect(fn);
  expect(fn).toHaveBeenCalledTimes(1);

  // 初期は a を見てる、 b の変更で再実行されない
  b.value = "B";
  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);

  // flag 切替 → 次の run で b を見るようになる
  flag.value = false;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);

  // 今度は a の変更で再実行されない
  a.value = "A";
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);

  // b の変更で再実行される
  b.value = "B2";
  flushSync();
  expect(fn).toHaveBeenCalledTimes(3);
});

test("onCleanup runs before next re-run", () => {
  const s = new Signal(0);
  const cleanup = vi.fn();

  effect(() => {
    void s.value;
    onCleanup(cleanup);
  });

  expect(cleanup).not.toHaveBeenCalled();

  s.value = 1;
  flushSync();
  expect(cleanup).toHaveBeenCalledTimes(1);

  s.value = 2;
  flushSync();
  expect(cleanup).toHaveBeenCalledTimes(2);
});

test("onCleanup runs on owner dispose", () => {
  const owner = new Owner(null);
  const cleanup = vi.fn();

  runWithOwner(owner, () => {
    effect(() => onCleanup(cleanup));
  });

  owner.dispose();
  expect(cleanup).toHaveBeenCalledTimes(1);
});

test("§4.3 example: clearInterval via onCleanup", () => {
  vi.useFakeTimers();
  const owner = new Owner(null);
  const tick = vi.fn();

  runWithOwner(owner, () => {
    effect(() => {
      const timer = setInterval(tick, 1000);
      onCleanup(() => clearInterval(timer));
    });
  });

  vi.advanceTimersByTime(3000);
  expect(tick).toHaveBeenCalledTimes(3);

  owner.dispose();
  vi.advanceTimersByTime(3000);
  expect(tick).toHaveBeenCalledTimes(3);

  vi.useRealTimers();
});

test("owner dispose stops further re-runs", () => {
  const owner = new Owner(null);
  const s = new Signal(0);
  const fn = vi.fn(() => s.value);

  runWithOwner(owner, () => effect(fn));
  expect(fn).toHaveBeenCalledTimes(1);

  owner.dispose();

  s.value = 1;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("signal no longer holds reference to disposed effect", () => {
  const owner = new Owner(null);
  const s = new Signal(0);

  runWithOwner(owner, () => effect(() => s.value));
  expect(s.subscribers.size).toBe(1);

  owner.dispose();
  expect(s.subscribers.size).toBe(0);
});

test("nested effects: parent owner dispose cascades to nested effect", () => {
  const owner = new Owner(null);
  const s = new Signal(0);
  const inner = vi.fn(() => s.value);

  runWithOwner(owner, () => {
    effect(() => {
      effect(inner);
    });
  });
  expect(inner).toHaveBeenCalledTimes(1);

  owner.dispose();

  s.value = 1;
  flushSync();
  expect(inner).toHaveBeenCalledTimes(1);
});

test("throws inside effect do not crash the scheduler", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const s = new Signal(0);
  const after = vi.fn();

  effect(() => {
    if (s.value > 0) throw new Error("boom");
  });
  effect(() => {
    void s.value;
    after();
  });

  s.value = 1;
  flushSync();

  expect(after).toHaveBeenCalledTimes(2);
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});

test("module-scope effect (no owner) is not auto-disposed", () => {
  const s = new Signal(0);
  const fn = vi.fn(() => s.value);

  // owner なしで effect を作る (module scope simulation)
  effect(fn);

  s.value = 1;
  flushSync();
  expect(fn).toHaveBeenCalledTimes(2);
});

test("onCleanup outside any owner is a no-op", () => {
  // effect の外で呼ばれた onCleanup は捨てられる (§5 module scope と整合)
  expect(() => onCleanup(() => {})).not.toThrow();
});
