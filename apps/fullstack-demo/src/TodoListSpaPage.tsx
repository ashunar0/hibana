// @ts-nocheck
// /todos-spa page。 server からの初期 data は持たない (= 完全 SPA mode の demo)。
// chrome (h1 / 説明) + 中に TodoListSpa island (Resource fetch + 同じ TodoList を render)。
import { TodoListSpa } from "./TodoListSpa.tsx";

export component TodoListSpaPage() {
  <main>
    <h1>TodoList (SPA mode)</h1>
    <p>
      分離 mode demo: server からの初期 props 無し、 client で Resource fetch で取得。
      取得後に同じ TodoList component を render (= 両 mode 連続性: 違うのは data source だけ)。
    </p>
    <TodoListSpa />
  </main>
}
