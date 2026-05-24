import { Signal, onCleanup } from "hibana";
import { AutoCounterP3, CounterP3 } from "./pattern3-demo.tsx";

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
  );
}
