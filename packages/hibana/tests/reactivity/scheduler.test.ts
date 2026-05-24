import { expect, test, vi } from "vite-plus/test";
import { type Schedulable, flushSync, schedule } from "../../src/reactivity/scheduler.ts";

function makeTask(fn: () => void = () => {}): Schedulable {
  return { run: fn };
}

test("scheduled task runs on next microtask", async () => {
  const fn = vi.fn();
  schedule(makeTask(fn));

  expect(fn).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("flushSync runs queued tasks synchronously", () => {
  const fn = vi.fn();
  schedule(makeTask(fn));

  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("flushSync on empty queue is a no-op", () => {
  expect(() => flushSync()).not.toThrow();
});

test("same task scheduled multiple times runs once per flush", () => {
  const fn = vi.fn();
  const task = makeTask(fn);

  schedule(task);
  schedule(task);
  schedule(task);

  flushSync();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("multiple distinct tasks all run in one flush", () => {
  const order: number[] = [];
  schedule(makeTask(() => order.push(1)));
  schedule(makeTask(() => order.push(2)));
  schedule(makeTask(() => order.push(3)));

  flushSync();
  expect(order).toEqual([1, 2, 3]);
});

test("task scheduled during flush runs in next flush, not the current one", () => {
  const order: string[] = [];
  const later = makeTask(() => order.push("later"));
  const first = makeTask(() => {
    order.push("first");
    schedule(later);
  });

  schedule(first);
  flushSync();
  expect(order).toEqual(["first"]);

  flushSync();
  expect(order).toEqual(["first", "later"]);
});

test("task scheduled during flush runs in next microtask automatically", async () => {
  const order: string[] = [];
  const later = makeTask(() => order.push("later"));
  schedule(
    makeTask(() => {
      order.push("first");
      schedule(later);
    }),
  );

  await Promise.resolve();
  expect(order).toEqual(["first"]);
  await Promise.resolve();
  expect(order).toEqual(["first", "later"]);
});

test("throwing task does not block remaining tasks", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const after = vi.fn();

  schedule(
    makeTask(() => {
      throw new Error("boom");
    }),
  );
  schedule(makeTask(after));

  flushSync();
  expect(after).toHaveBeenCalledTimes(1);
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});
