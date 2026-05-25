// @ts-nocheck
// Pattern 3 syntax 専用デモ。 Vite plugin (hibana) が transform する前提。
// TS の type checker は `component` を理解しないので nocheck で抑制。
// (Phase 2 で SWC plugin に切替えると型完全保持できる予定 — 設計書 §7)
//
// 新 syntax (T15.6, 2026-05-24): `render { }` は廃止し、 `component` 本体全体が
// do-block として振る舞う。 body 末尾の JSX 式が自動 return される。
import { Computed, Signal, Store, onCleanup, onMount, untrack } from "hibana";

component CounterP3() {
  const count = new Signal(0);
  <button onClick={() => count.value++}>
    P3 Count: {count.value}
  </button>;
}

component AutoCounterP3() {
  const count = new Signal(0);
  const timer = setInterval(() => count.value++, 1000);
  onCleanup(() => clearInterval(timer));
  <p>P3 Auto-tick: {count.value}</p>;
}

// T16-MVP: @{ } 局所 do-block。 単一 expression (ternary) で DOM 切替
component ShowCaseP3() {
  const count = new Signal(0);
  <div>
    <button onClick={() => count.value++}>p3-show: {count.value}</button>
    @{ count.value === 0 ? <span>zero</span> : count.value % 2 === 0 ? <strong>even</strong> : <em>odd</em> }
  </div>;
}

// T16-b: @{ } 内に statement 列を書き、 末尾の式が auto-return される
component DoBlockP3() {
  const count = new Signal(0);
  <div>
    <button onClick={() => count.value++}>p3-do: {count.value}</button>
    @{
      const label = count.value % 2 === 0 ? "偶数" : "奇数";
      const cls = count.value > 5 ? "big" : "small";
      <p className={cls}>label={label}, size={cls}</p>
    }
  </div>;
}

// T16-c: @{ if-else } の block-as-expression。 handoff.md の例そのままを動かせる
component IfElseP3() {
  const count = new Signal(0);
  <div>
    <button onClick={() => count.value++}>p3-if: {count.value}</button>
    @{
      if (count.value === 0) <span>zero</span>
      else if (count.value % 2 === 0) <strong>even {count.value}</strong>
      else <em>odd {count.value}</em>
    }
  </div>;
}

// T18: Computed derived signal を component から使う
component ComputedP3() {
  const count = new Signal(1);
  const doubled = new Computed(() => count.value * 2);
  const quadrupled = new Computed(() => doubled.value * 2);
  <div>
    <button onClick={() => count.value++}>p3-computed: count={count.value}</button>
    <p>doubled={doubled.value}, quadrupled={quadrupled.value}</p>
  </div>;
}

// T19: Store deep reactive、 nested mutation で DOM 更新
component StoreP3() {
  const state = new Store({ user: { name: "Asahi", age: 25 }, count: 0 });
  <div>
    <button onClick={() => state.count++}>p3-store: count={state.count}</button>
    <button onClick={() => (state.user.name = state.user.name === "Asahi" ? "Yusuke" : "Asahi")}>
      toggle name
    </button>
    <p>user.name={state.user.name}, user.age={state.user.age}</p>
    <button onClick={() => (state.user = { name: "Reset", age: 0 })}>replace user</button>
  </div>;
}

// onMount: client only / 初回 microtask 1 回。 表示 element の text を後から書き換える
component OnMountP3() {
  const status = new Signal("waiting...");
  onMount(() => {
    status.value = "mounted!";
  });
  <p>p3-onMount: status={status.value}</p>;
}

// untrack: tracked dep と untracked dep を分けて、 後者は DOM 更新しない確認
component UntrackP3() {
  const tracked = new Signal(0);
  const ignored = new Signal(0);
  <div>
    <button onClick={() => tracked.value++}>p3-untrack tracked++: {tracked.value}</button>
    <button onClick={() => ignored.value++}>ignored++ (no rerender)</button>
    <p>
      tracked={tracked.value}, ignored snapshot=
      @{ untrack(() => ignored.value) }
    </p>
  </div>;
}

export {
  CounterP3,
  AutoCounterP3,
  ShowCaseP3,
  DoBlockP3,
  IfElseP3,
  ComputedP3,
  StoreP3,
  OnMountP3,
  UntrackP3,
};
