import { Signal, onCleanup } from "hibana-core";
import {
  AutoCounterP3,
  ComputedP3,
  CounterP3,
  DarkModeP3,
  DoBlockP3,
  FormP3,
  GlitchFreeP3,
  IfElseP3,
  OnMountP3,
  OptimisticP3,
  ResourceP3,
  ShowCaseP3,
  StoreP3,
  TodoListP3,
  UntrackP3,
  ViewTransitionP3,
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

// ===== App: 全 demo を 1 つの component tree に統合 =====

export function App() {
  return (
    <div>
      <h1>Hibana playground</h1>

      <section>
        <h2>素 JSX 経路 (compiler 抜き)</h2>
        <p>TS automatic runtime + jsxImportSource: "hibana-core"</p>
        <Counter />
        <AutoCounter />
        <p>reactive Node-child (T9.6):</p>
        <ShowCase />
      </section>

      <hr />

      <section>
        <h2>Pattern 3 syntax 経路 (Vite plugin 経由)</h2>
        <p>component / signal-binding を全部 compile</p>
        <CounterP3 />
        <AutoCounterP3 />
        <p>{"@{ }"} 局所 do-block (T16-MVP):</p>
        <ShowCaseP3 />
        <p>{"@{ stmts; lastExpr }"} statement 列 auto-return (T16-b):</p>
        <DoBlockP3 />
        <p>{"@{ if-else }"} block-as-expression (T16-c):</p>
        <IfElseP3 />
      </section>

      <hr />

      <section>
        <h2>Phase 1.5 primitive dogfood</h2>
        <p>T18 Computed (derived signals chain):</p>
        <ComputedP3 />
        <p>T18.5 glitch-free: same-value derived → effect run skip (3-state):</p>
        <GlitchFreeP3 />
        <p>T19 Store (deep reactive, nested mutation, top-level replace):</p>
        <StoreP3 />
        <p>T21 onMount (mounts → microtask → status update):</p>
        <OnMountP3 />
        <p>T21 untrack (ignored signal does not rerender the surrounding text):</p>
        <UntrackP3 />
        <p>T20 Resource (async data, auto-refetch on dep signal change, manual refetch):</p>
        <ResourceP3 />
        <p>T20+ Mutation + optimistic update (50% fake error → rollback):</p>
        <OptimisticP3 />
      </section>

      <hr />

      <section>
        <h2>T22 統合 demo</h2>
        <p>TodoList: Store + Signal + Computed + reactive list rendering (T9.7)</p>
        <TodoListP3 />
      </section>

      <hr />

      <section>
        <h2>Dark mode dogfood</h2>
        <p>Signal + onMount (load) + effect (DOM + localStorage)</p>
        <DarkModeP3 />
      </section>

      <hr />

      <section>
        <h2>Form dogfood</h2>
        <p>controlled input × 3 + onSubmit + {"@{ if-else }"} で submit 状態の分岐表示</p>
        <FormP3 />
      </section>

      <hr />

      <section>
        <h2>View Transitions dogfood</h2>
        <p>signal.set を document.startViewTransition で wrap して browser 標準 fade</p>
        <ViewTransitionP3 />
      </section>
    </div>
  );
}
