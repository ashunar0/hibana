import { Signal, onCleanup } from "hibana";
import {
  AutoCounterP3,
  ComputedP3,
  CounterP3,
  DoBlockP3,
  GlitchFreeP3,
  IfElseP3,
  OnMountP3,
  OptimisticP3,
  ResourceP3,
  ShowCaseP3,
  StoreP3,
  TodoListP3,
  UntrackP3,
} from "./pattern3-demo.tsx";

// ===== 素 JSX 版 (TS automatic runtime, compiler 不要) =====

function Counter() {
  const count = new Signal(0);
  return <button onClick={() => count.value++}>Count: {() => count.value}</button>;
}

function AutoCounter() {
  const count = new Signal(0);
  const timer = setInterval(() => count.value++, 1000);
  onCleanup(() => clearInterval(timer));

  return <p>Auto-tick: {() => count.value}</p>;
}

// T9.6 動作確認: function child が Node を返すと DOM が切り替わる
function ShowCase() {
  const count = new Signal(0);
  return (
    <div>
      <button onClick={() => count.value++}>show: {() => count.value}</button>{" "}
      {() =>
        count.value === 0 ? (
          <span>zero</span>
        ) : count.value % 2 === 0 ? (
          <strong>even {() => count.value}</strong>
        ) : (
          <em>odd {() => count.value}</em>
        )
      }
    </div>
  );
}

// ===== mount =====

const app = document.querySelector("#app");
if (app) {
  app.append(
    (<h1>Hibana playground</h1>) as Node,
    (<h2>素 JSX 経路 (compiler 抜き)</h2>) as Node,
    (<p>TS automatic runtime + jsxImportSource: "hibana"</p>) as Node,
    Counter() as Node,
    AutoCounter() as Node,
    (<p>reactive Node-child (T9.6):</p>) as Node,
    ShowCase() as Node,
    (<hr />) as Node,
    (<h2>Pattern 3 syntax 経路 (Vite plugin 経由)</h2>) as Node,
    (<p>component / render / signal-binding を全部 compile</p>) as Node,
    CounterP3() as Node,
    AutoCounterP3() as Node,
    (<p>{"@{ }"} 局所 do-block (T16-MVP):</p>) as Node,
    ShowCaseP3() as Node,
    (<p>{"@{ stmts; lastExpr }"} statement 列 auto-return (T16-b):</p>) as Node,
    DoBlockP3() as Node,
    (<p>{"@{ if-else }"} block-as-expression (T16-c):</p>) as Node,
    IfElseP3() as Node,
    (<hr />) as Node,
    (<h2>Phase 1.5 primitive dogfood</h2>) as Node,
    (<p>T18 Computed (derived signals chain):</p>) as Node,
    ComputedP3() as Node,
    (<p>T18.5 glitch-free: same-value derived → effect run skip (3-state):</p>) as Node,
    GlitchFreeP3() as Node,
    (<p>T19 Store (deep reactive, nested mutation, top-level replace):</p>) as Node,
    StoreP3() as Node,
    (<p>T21 onMount (mounts → microtask → status update):</p>) as Node,
    OnMountP3() as Node,
    (<p>T21 untrack (ignored signal does not rerender the surrounding text):</p>) as Node,
    UntrackP3() as Node,
    (<p>T20 Resource (async data, auto-refetch on dep signal change, manual refetch):</p>) as Node,
    ResourceP3() as Node,
    (<p>T20+ Mutation + optimistic update (50% fake error → rollback):</p>) as Node,
    OptimisticP3() as Node,
    (<hr />) as Node,
    (<h2>T22 統合 demo</h2>) as Node,
    (<p>TodoList: Store + Signal + Computed + reactive list rendering (T9.7)</p>) as Node,
    TodoListP3() as Node,
  );
}
