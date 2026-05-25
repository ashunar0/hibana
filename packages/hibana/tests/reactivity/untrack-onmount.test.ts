import { expect, test } from "vite-plus/test";
import { effect, onMount, untrack } from "../../src/reactivity/effect.ts";
import { Owner, runWithOwner } from "../../src/reactivity/owner.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Signal } from "../../src/reactivity/signal.ts";

function nextMicrotask(): Promise<void> {
  return Promise.resolve();
}

// ---- untrack ----

test("untrack: signal read inside is not registered as dep", () => {
  const a = new Signal(1);
  let runs = 0;

  effect(() => {
    untrack(() => a.value);
    runs++;
  });
  expect(runs).toBe(1);

  a.value = 2;
  flushSync();
  expect(runs).toBe(1);
});

test("untrack: returns fn return value", () => {
  const a = new Signal(42);
  const result = untrack(() => a.value * 2);
  expect(result).toBe(84);
});

test("untrack: tracked + untracked in same effect, only tracked counts", () => {
  const tracked = new Signal(1);
  const ignored = new Signal(100);
  let runs = 0;

  effect(() => {
    void tracked.value;
    untrack(() => ignored.value);
    runs++;
  });
  expect(runs).toBe(1);

  ignored.value = 200;
  flushSync();
  expect(runs).toBe(1);

  tracked.value = 2;
  flushSync();
  expect(runs).toBe(2);
});

test("untrack: tracking restores after untrack scope exits", () => {
  const a = new Signal(1);
  const b = new Signal(2);
  let runs = 0;

  effect(() => {
    untrack(() => a.value);
    void b.value;
    runs++;
  });
  expect(runs).toBe(1);

  a.value = 99;
  flushSync();
  expect(runs).toBe(1);

  b.value = 99;
  flushSync();
  expect(runs).toBe(2);
});

// ---- onMount ----

test("onMount: fires once on next microtask", async () => {
  let fired = 0;
  onMount(() => {
    fired++;
  });
  expect(fired).toBe(0);
  await nextMicrotask();
  expect(fired).toBe(1);
});

test("onMount: does not re-fire when subsequent signals change", async () => {
  const a = new Signal(1);
  let fired = 0;
  onMount(() => {
    void a.value;
    fired++;
  });
  await nextMicrotask();
  expect(fired).toBe(1);

  a.value = 2;
  flushSync();
  await nextMicrotask();
  expect(fired).toBe(1);
});

test("onMount: skipped if owner disposes before microtask flush", async () => {
  const owner = new Owner(null);
  let fired = 0;

  runWithOwner(owner, () => {
    onMount(() => {
      fired++;
    });
  });

  owner.dispose();
  await nextMicrotask();
  expect(fired).toBe(0);
});

test("onMount: fires when owner is still alive at microtask time", async () => {
  const owner = new Owner(null);
  let fired = 0;

  runWithOwner(owner, () => {
    onMount(() => {
      fired++;
    });
  });

  await nextMicrotask();
  expect(fired).toBe(1);

  owner.dispose();
});

test("onMount: error inside fn is swallowed (console.error) — does not throw", async () => {
  const orig = console.error;
  let captured = 0;
  console.error = () => {
    captured++;
  };
  try {
    onMount(() => {
      throw new Error("boom");
    });
    await nextMicrotask();
    expect(captured).toBe(1);
  } finally {
    console.error = orig;
  }
});
