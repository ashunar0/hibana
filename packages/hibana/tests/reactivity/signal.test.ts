import { expect, test } from "vite-plus/test";
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

test("constructor stores initial value", () => {
  const s = new Signal(42);
  expect(s.peek()).toBe(42);
});

test(".value reads current value", () => {
  const s = new Signal("hello");
  expect(s.value).toBe("hello");
});

test(".value = next writes new value", () => {
  const s = new Signal(0);
  s.value = 100;
  expect(s.peek()).toBe(100);
});

test(".value read inside subscriber registers dependency", () => {
  const s = new Signal(1);
  const sub = makeSubscriber();

  runWithSubscriber(sub, () => s.value);
  expect(s.subscribers.has(sub)).toBe(true);
  expect(sub.dependencies.has(s)).toBe(true);
});

test(".peek() does not register dependency", () => {
  const s = new Signal(1);
  const sub = makeSubscriber();

  runWithSubscriber(sub, () => s.peek());
  expect(s.subscribers.size).toBe(0);
  expect(sub.dependencies.size).toBe(0);
});

test("write notifies subscribers", () => {
  const s = new Signal(0);
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.value);

  s.value = 1;
  expect(sub.notifyCount).toBe(1);
});

test("same-value write is skipped (Object.is)", () => {
  const s = new Signal(0);
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.value);

  s.value = 0;
  expect(sub.notifyCount).toBe(0);

  s.value = 1;
  expect(sub.notifyCount).toBe(1);
});

test("NaN === NaN per Object.is (set NaN over NaN is skipped)", () => {
  const s = new Signal(Number.NaN);
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.value);

  s.value = Number.NaN;
  expect(sub.notifyCount).toBe(0);
});

test("+0 and -0 are distinct per Object.is", () => {
  const s = new Signal(0);
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.value);

  s.value = -0;
  expect(sub.notifyCount).toBe(1);
});

test("compound assignment (++, +=) notifies", () => {
  const s = new Signal(0);
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.value);

  s.value++;
  expect(s.peek()).toBe(1);
  expect(sub.notifyCount).toBe(1);

  s.value += 5;
  expect(s.peek()).toBe(6);
  expect(sub.notifyCount).toBe(2);
});

test("shallow tracking: mutating the same reference does not notify", () => {
  const s = new Signal<number[]>([1, 2, 3]);
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.value);

  s.peek().push(4);
  expect(sub.notifyCount).toBe(0);

  s.value = [...s.peek()];
  expect(sub.notifyCount).toBe(1);
});

test("multiple subscribers all get notified", () => {
  const s = new Signal(0);
  const a = makeSubscriber();
  const b = makeSubscriber();
  runWithSubscriber(a, () => s.value);
  runWithSubscriber(b, () => s.value);

  s.value = 1;
  expect(a.notifyCount).toBe(1);
  expect(b.notifyCount).toBe(1);
});

test("explicit generics", () => {
  const s = new Signal<string | null>(null);
  s.value = "hello";
  expect(s.value).toBe("hello");
});
