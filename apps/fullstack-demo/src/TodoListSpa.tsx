// @ts-nocheck
// TodoListSpa (= 分離 mode demo の核):
//
// - server からの初期 data が無い前提、 Resource で client fetch `GET /todos` (Accept: application/json)
// - fetch 完了後に `<TodoList initialTodos={resource.value}/>` を描画 → mountIslands の
//   MutationObserver が後追い hydrate (= async-appearing island)
// - TodoList component 本体は fullstack mode と同じソース (= 両 mode 連続性の articulation)、
//   違うのは data source (page-level props vs component-level Resource) だけ
import { Resource } from "hibana-core";
import { TodoList } from "./TodoList.tsx";

export component TodoListSpa() {
  const resource = new Resource(async () => {
    const res = await fetch("/todos", { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("fetch /todos failed: " + res.status);
    const data = await res.json();
    return data.todos;
  });

  <div>
    @{ if (resource.loading) <p>loading…</p>
       else if (resource.error !== null) <p>error: {resource.error.message}</p>
       else <TodoList initialTodos={resource.value} /> }
  </div>
}
