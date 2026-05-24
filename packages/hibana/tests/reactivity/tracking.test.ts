import { expect, test } from "vite-plus/test";
import {
  type Subject,
  type Subscriber,
  clearDependencies,
  getCurrentSubscriber,
  notifySubscribers,
  runWithSubscriber,
  track,
} from "../../src/reactivity/tracking.ts";

function makeSubject(): Subject {
  return { subscribers: new Set() };
}

function makeSubscriber(): Subscriber & { notifyCount: number } {
  return {
    dependencies: new Set(),
    notifyCount: 0,
    notify() {
      this.notifyCount++;
    },
  };
}

test("currentSubscriber starts as null", () => {
  expect(getCurrentSubscriber()).toBe(null);
});

test("runWithSubscriber sets and restores currentSubscriber", () => {
  const sub = makeSubscriber();
  const seen = runWithSubscriber(sub, () => getCurrentSubscriber());
  expect(seen).toBe(sub);
  expect(getCurrentSubscriber()).toBe(null);
});

test("runWithSubscriber restores even on throw", () => {
  const sub = makeSubscriber();
  expect(() =>
    runWithSubscriber(sub, () => {
      throw new Error("boom");
    }),
  ).toThrow("boom");
  expect(getCurrentSubscriber()).toBe(null);
});

test("track wires up bidirectional link", () => {
  const subject = makeSubject();
  const sub = makeSubscriber();

  runWithSubscriber(sub, () => track(subject));
  expect(subject.subscribers.has(sub)).toBe(true);
  expect(sub.dependencies.has(subject)).toBe(true);
});

test("track is no-op without active subscriber", () => {
  const subject = makeSubject();
  track(subject);
  expect(subject.subscribers.size).toBe(0);
});

test("notifySubscribers calls notify on all subscribers", () => {
  const subject = makeSubject();
  const a = makeSubscriber();
  const b = makeSubscriber();
  subject.subscribers.add(a);
  subject.subscribers.add(b);

  notifySubscribers(subject);
  expect(a.notifyCount).toBe(1);
  expect(b.notifyCount).toBe(1);
});

test("notifySubscribers tolerates subscribers added during notify", () => {
  const subject = makeSubject();
  const late = makeSubscriber();
  const first: Subscriber = {
    dependencies: new Set(),
    notify() {
      subject.subscribers.add(late);
    },
  };
  subject.subscribers.add(first);

  expect(() => notifySubscribers(subject)).not.toThrow();
  expect(late.notifyCount).toBe(0);
});

test("clearDependencies unlinks subscriber from all subjects", () => {
  const s1 = makeSubject();
  const s2 = makeSubject();
  const sub = makeSubscriber();

  runWithSubscriber(sub, () => {
    track(s1);
    track(s2);
  });
  expect(s1.subscribers.size).toBe(1);
  expect(s2.subscribers.size).toBe(1);
  expect(sub.dependencies.size).toBe(2);

  clearDependencies(sub);
  expect(s1.subscribers.size).toBe(0);
  expect(s2.subscribers.size).toBe(0);
  expect(sub.dependencies.size).toBe(0);
});
