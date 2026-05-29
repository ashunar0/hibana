// @ts-nocheck
// /todos page。 page-level chrome (h1 / 説明) + 内側に TodoList island。
// props.todos は server (= app/routes/todos.tsx GET handler) から渡される、
// TodoList に initialTodos={props.todos} で bridge (= transform-island が
// dynamic prop を JSON.stringify wrap で data-props に焼く)。
import { TodoList } from "./TodoList.tsx";

export component TodoListPage(props) {
  <main>
    <h1>TodoList</h1>
    <p>
      Server state を form 経由で更新する demo。
      JS off でも form action + 303 redirect、 JS on なら fetch + 楽観更新 (= 同じ component / 同じ endpoint)。
    </p>
    <TodoList initialTodos={props.todos} />
  </main>
}
