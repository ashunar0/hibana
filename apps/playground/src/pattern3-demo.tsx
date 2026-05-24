// @ts-nocheck
// Pattern 3 syntax 専用デモ。 Vite plugin (hibana) が transform する前提。
// TS の type checker は `component` / `render` を理解しないので nocheck で抑制。
// (Phase 2 で SWC plugin に切替えると型完全保持できる予定 — 設計書 §7)
import { Signal, onCleanup } from "hibana";

component CounterP3() {
  const count = new Signal(0);
  render {
    <button onClick={() => count.value++}>
      P3 Count: {count.value}
    </button>;
  }
}

component AutoCounterP3() {
  const count = new Signal(0);
  const timer = setInterval(() => count.value++, 1000);
  onCleanup(() => clearInterval(timer));
  render {
    <p>P3 Auto-tick: {count.value}</p>;
  }
}

export { CounterP3, AutoCounterP3 };
