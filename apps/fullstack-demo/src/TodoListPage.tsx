// @ts-nocheck
// fullstack-demo の TodoList page (= /todos)。 server state を form 経由で
// 更新する demo、 no-JS でも完全に動く (= form action + 303 redirect)。
// 全て static SSR、 client JS は shipping されない (= props は server から渡る)。

export component TodoListPage(props) {
  <main>
    <h1>TodoList</h1>
    <p>
      Server state を form 経由で更新する demo。
      JS off でも完全に動く (form action + 303 redirect)。
    </p>

    <form method="POST" action="/todos">
      <label>
        new:{" "}
        <input type="text" name="text" required autocomplete="off" />
      </label>{" "}
      <button type="submit">Add</button>
    </form>

    <ul>
      @{ for (const todo of props.todos) {
        <li>
          <form method="POST" action={"/todos/" + todo.id + "/toggle"} style="display:inline">
            <button type="submit">{todo.done ? "✓" : "○"}</button>
          </form>{" "}
          <span style={todo.done ? "text-decoration: line-through" : ""}>{todo.text}</span>{" "}
          <form method="POST" action={"/todos/" + todo.id + "/delete"} style="display:inline">
            <button type="submit">×</button>
          </form>
        </li>
      } }
    </ul>

    @{ if (props.todos.length === 0) <p>(empty)</p> }
  </main>
}
