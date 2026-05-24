import { expect, test, vi } from "vite-plus/test";
import {
  Owner,
  addCleanupToCurrentOwner,
  getCurrentOwner,
  runWithOwner,
} from "../../src/reactivity/owner.ts";

test("dispose runs registered cleanups", () => {
  const owner = new Owner(null);
  const fn = vi.fn();
  owner.addCleanup(fn);

  owner.dispose();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("cleanups run in LIFO order", () => {
  const owner = new Owner(null);
  const calls: number[] = [];
  owner.addCleanup(() => calls.push(1));
  owner.addCleanup(() => calls.push(2));
  owner.addCleanup(() => calls.push(3));

  owner.dispose();
  expect(calls).toEqual([3, 2, 1]);
});

test("parent dispose cascades to descendants", () => {
  const root = new Owner(null);
  const child = runWithOwner(root, () => new Owner());
  const grandchild = runWithOwner(child, () => new Owner());

  const calls: string[] = [];
  root.addCleanup(() => calls.push("root"));
  child.addCleanup(() => calls.push("child"));
  grandchild.addCleanup(() => calls.push("grandchild"));

  root.dispose();
  expect(calls).toEqual(["grandchild", "child", "root"]);
  expect(child.disposed).toBe(true);
  expect(grandchild.disposed).toBe(true);
});

test("dispose is idempotent", () => {
  const owner = new Owner(null);
  const fn = vi.fn();
  owner.addCleanup(fn);

  owner.dispose();
  owner.dispose();
  expect(fn).toHaveBeenCalledTimes(1);
});

test("addCleanup on disposed owner runs immediately", () => {
  const owner = new Owner(null);
  owner.dispose();

  const fn = vi.fn();
  owner.addCleanup(fn);
  expect(fn).toHaveBeenCalledTimes(1);
});

test("cleanup errors do not block remaining cleanups", () => {
  const owner = new Owner(null);
  const fn = vi.fn();
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  owner.addCleanup(fn);
  owner.addCleanup(() => {
    throw new Error("boom");
  });

  owner.dispose();
  expect(fn).toHaveBeenCalledTimes(1);
  expect(errorSpy).toHaveBeenCalled();
  errorSpy.mockRestore();
});

test("runWithOwner sets and restores currentOwner", () => {
  expect(getCurrentOwner()).toBe(null);

  const owner = new Owner(null);
  const inner = runWithOwner(owner, () => getCurrentOwner());
  expect(inner).toBe(owner);
  expect(getCurrentOwner()).toBe(null);
});

test("runWithOwner restores currentOwner even when fn throws", () => {
  const owner = new Owner(null);
  expect(() =>
    runWithOwner(owner, () => {
      throw new Error("boom");
    }),
  ).toThrow("boom");
  expect(getCurrentOwner()).toBe(null);
});

test("new Owner() auto-attaches to currentOwner", () => {
  const root = new Owner(null);
  const child = runWithOwner(root, () => new Owner());

  expect(child.parent).toBe(root);
  expect(root.children).toContain(child);
});

test("addCleanupToCurrentOwner is no-op without owner", () => {
  expect(() => addCleanupToCurrentOwner(() => {})).not.toThrow();
});

test("addCleanupToCurrentOwner registers to active owner", () => {
  const owner = new Owner(null);
  const fn = vi.fn();
  runWithOwner(owner, () => addCleanupToCurrentOwner(fn));

  owner.dispose();
  expect(fn).toHaveBeenCalledTimes(1);
});
