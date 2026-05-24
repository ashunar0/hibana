// @ts-nocheck
// Pattern 3 syntax 専用デモ。 Vite plugin (hibana) が transform する前提。
// TS の type checker は `component` を理解しないので nocheck で抑制。
// (Phase 2 で SWC plugin に切替えると型完全保持できる予定 — 設計書 §7)
//
// 新 syntax (T15.6, 2026-05-24): `render { }` は廃止し、 `component` 本体全体が
// do-block として振る舞う。 body 末尾の JSX 式が自動 return される。
import { Signal, onCleanup } from "hibana";

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

export { CounterP3, AutoCounterP3, ShowCaseP3 };
