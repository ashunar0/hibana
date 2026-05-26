import { expect, test } from "vite-plus/test";
import { effect } from "../../src/reactivity/effect.ts";
import { flushSync } from "../../src/reactivity/scheduler.ts";
import { Store } from "../../src/reactivity/store.ts";
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

test("constructor wraps an object and allows direct read", () => {
  const s = new Store({ count: 0, name: "hibana" });
  expect(s.count).toBe(0);
  expect(s.name).toBe("hibana");
});

test("property read inside subscriber registers dependency", () => {
  const s = new Store({ count: 0 });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.count);
  expect(sub.dependencies.size).toBe(1);
});

test("property write notifies key subscriber", () => {
  const s = new Store({ count: 0 });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.count);

  s.count = 5;
  expect(sub.notifyCount).toBe(1);
});

test("same-value write does not notify (Object.is)", () => {
  const s = new Store({ count: 5 });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.count);

  s.count = 5;
  expect(sub.notifyCount).toBe(0);
});

test("unrelated key write does not notify", () => {
  const s = new Store({ a: 1, b: 2 });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.a);

  s.b = 99;
  expect(sub.notifyCount).toBe(0);
});

test("nested object: deep mutation notifies", () => {
  const s = new Store({ user: { name: "Asahi" } });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.user.name);

  s.user.name = "Yusuke";
  expect(sub.notifyCount).toBe(1);
  expect(s.user.name).toBe("Yusuke");
});

test("nested object: top-level replacement notifies user-level subscriber", () => {
  const s = new Store<{ user: { name: string } }>({ user: { name: "Asahi" } });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.user);

  s.user = { name: "Reset" };
  expect(sub.notifyCount).toBe(1);
  expect(s.user.name).toBe("Reset");
});

test("top-level replacement makes subsequent nested mutations on new object reactive", () => {
  const s = new Store<{ user: { name: string } }>({ user: { name: "Asahi" } });
  const seen: string[] = [];

  effect(() => {
    seen.push(s.user.name);
  });
  expect(seen).toEqual(["Asahi"]);

  s.user = { name: "Reset" };
  flushSync();
  expect(seen).toEqual(["Asahi", "Reset"]);

  s.user.name = "Final";
  flushSync();
  expect(seen).toEqual(["Asahi", "Reset", "Final"]);
});

test("nested proxy is referentially stable (===)", () => {
  const s = new Store({ user: { name: "Asahi" } });
  expect(s.user).toBe(s.user);
});

test("delete property notifies key subscriber", () => {
  const s = new Store<{ a?: number }>({ a: 1 });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.a);

  delete s.a;
  expect(sub.notifyCount).toBe(1);
  expect(s.a).toBeUndefined();
});

test("array: index read / write reactive", () => {
  const s = new Store({ list: [1, 2, 3] });
  const sub = makeSubscriber();
  runWithSubscriber(sub, () => s.list[0]);

  s.list[0] = 10;
  expect(sub.notifyCount).toBe(1);
  expect(s.list[0]).toBe(10);
});

test("array: length subscription + push", () => {
  const s = new Store({ list: [1, 2] });
  const lenSub = makeSubscriber();
  runWithSubscriber(lenSub, () => s.list.length);

  s.list.push(3);
  // push は内部で list[2]=3 と list.length=3 の 2 set を発火する
  // length sub は length write の 1 回だけ拾う
  expect(lenSub.notifyCount).toBe(1);
  expect(s.list.length).toBe(3);
  expect(s.list[2]).toBe(3);
});

test("non-plain object (Date) is not wrapped", () => {
  const date = new Date(2026, 4, 25);
  const s = new Store({ d: date });
  // raw Date instance がそのまま返る (Proxy で覆われない)
  expect(s.d).toBe(date);
});

test("plain object inside Store gets unwrapped on assign (raw stored internally)", () => {
  const s1 = new Store<{ user: { name: string } }>({ user: { name: "a" } });
  const s2 = new Store<{ user: { name: string } }>({ user: { name: "b" } });

  // s1.user を s2 に代入 → 内部は raw が再利用される
  s2.user = s1.user;
  expect(s2.user.name).toBe("a");

  // s1.user.name 変更で s2.user.name も同じ raw を共有
  s1.user.name = "shared";
  expect(s2.user.name).toBe("shared");
});

test("integration: effect tracks nested path and reruns on write", () => {
  const s = new Store({ user: { name: "Asahi", age: 25 } });
  const seen: string[] = [];

  effect(() => {
    seen.push(`${s.user.name}/${s.user.age}`);
  });
  expect(seen).toEqual(["Asahi/25"]);

  s.user.name = "Yusuke";
  flushSync();
  expect(seen).toEqual(["Asahi/25", "Yusuke/25"]);

  s.user.age = 30;
  flushSync();
  expect(seen).toEqual(["Asahi/25", "Yusuke/25", "Yusuke/30"]);
});

test("integration: untracked nested change does not rerun effect", () => {
  const s = new Store({ user: { name: "Asahi" }, count: 0 });
  let runs = 0;

  effect(() => {
    void s.count;
    runs++;
  });
  expect(runs).toBe(1);

  s.user.name = "Yusuke";
  flushSync();
  expect(runs).toBe(1);

  s.count = 1;
  flushSync();
  expect(runs).toBe(2);
});
