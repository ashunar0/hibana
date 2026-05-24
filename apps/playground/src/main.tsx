import { Signal, onCleanup } from "hibana";

// TS automatic JSX runtime + jsxImportSource: "hibana" 経由で動く。
// 自作 compiler 一切なし、 .tsx を TS が <button> → jsx("button", {...}) に変換するだけで
// signal-native UI が動く。 これが「core (signal + jsx) だけ使うルート」 の検証。

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

const app = document.querySelector("#app");
if (app) {
  app.append(
    (<h1>Hibana playground</h1>) as Node,
    (<p>素 JSX + jsxImportSource: "hibana" (compiler 抜き)</p>) as Node,
    Counter() as Node,
    AutoCounter() as Node,
  );
}
