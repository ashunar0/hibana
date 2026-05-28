// @ts-nocheck
// hsx 版: component keyword + 別ファイル component の組み合わせ。
// vp build で dist/islands.json に App / Counter / Greeting が並ぶことを確認する。
import { Counter } from "./components/Counter.tsx";
import { Greeting } from "./components/Greeting.tsx";

export component App() {
  <main>
    <h1>Hibana Island Demo</h1>
    <Greeting name="あさひ" />
    <Counter />
  </main>
}
