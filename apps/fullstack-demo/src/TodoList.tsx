// @ts-nocheck
// TodoList island (= phase 2 楽観更新の核):
//
// - props.initialTodos は server-rendered の todos 配列 (= TodoListPage 経由で
//   data-props に焼き込まれ、 hydrate 時に mountIslands が JSON.parse で復元)
// - JS off の path: 各 <form action="..."> の native submit がそのまま走り、
//   server は form-encoded body を受け取って 303 redirect、 新 SSR で UI 反映 (= phase 1 と同じ動作)
// - JS on の path: onSubmit を e.preventDefault() で intercept → Mutation.mutate
//   onMutate で楽観的更新 (todos signal 書き換え) → fetch でも server に POST →
//   onSuccess で server 確定値 sync、 onError で rollback
//
// server endpoint は同じ /todos *, Accept: application/json で response 形式を切り替える
// (= 「同じ handler が両 mode 動く」 articulation)
import { Mutation, Signal } from "hibana-core";

export component TodoList(props) {
  const todos = new Signal(props.initialTodos ?? []);

  const addMutation = new Mutation(
    async (text) => {
      const res = await fetch("/todos", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ text }),
      });
      if (!res.ok) throw new Error("add failed: " + res.status);
      const data = await res.json();
      return data.todo;
    },
    {
      onMutate: (text) => {
        // 楽観 ID は負値で衝突回避 (server 確定 ID は正)
        const tempId = -Date.now();
        todos.value = [
          ...todos.value,
          { id: tempId, text: text.trim(), done: false },
        ];
        return { tempId };
      },
      onSuccess: (todo, _input, ctx) => {
        if (!todo) {
          // server が null (= empty text) を返したら temp 削除
          todos.value = todos.value.filter((t) => t.id !== ctx.tempId);
          return;
        }
        todos.value = todos.value.map((t) => (t.id === ctx.tempId ? todo : t));
      },
      onError: (_err, _input, ctx) => {
        todos.value = todos.value.filter((t) => t.id !== ctx.tempId);
      },
    },
  );

  const toggleMutation = new Mutation(
    async (id) => {
      const res = await fetch("/todos/" + id + "/toggle", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("toggle failed: " + res.status);
      const data = await res.json();
      return data.todo;
    },
    {
      onMutate: (id) => {
        const prev = todos.value;
        todos.value = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
        return { prev };
      },
      onSuccess: (todo, id) => {
        if (!todo) return;
        todos.value = todos.value.map((t) => (t.id === id ? todo : t));
      },
      onError: (_err, _id, ctx) => {
        todos.value = ctx.prev;
      },
    },
  );

  const deleteMutation = new Mutation(
    async (id) => {
      const res = await fetch("/todos/" + id + "/delete", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("delete failed: " + res.status);
      return await res.json();
    },
    {
      onMutate: (id) => {
        const prev = todos.value;
        todos.value = prev.filter((t) => t.id !== id);
        return { prev };
      },
      onError: (_err, _id, ctx) => {
        todos.value = ctx.prev;
      },
    },
  );

  const onAddSubmit = (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const text = String(fd.get("text") ?? "");
    if (!text.trim()) return;
    addMutation.mutate(text);
    form.reset();
  };

  const onToggleSubmit = (id) => (e) => {
    e.preventDefault();
    toggleMutation.mutate(id);
  };

  const onDeleteSubmit = (id) => (e) => {
    e.preventDefault();
    deleteMutation.mutate(id);
  };

  <div>
    <form method="POST" action="/todos" onSubmit={onAddSubmit}>
      <label>
        new:{" "}
        <input type="text" name="text" required autocomplete="off" />
      </label>{" "}
      <button type="submit">Add</button>
    </form>

    <ul>
      @{ for (const todo of todos.value) {
        <li>
          <form
            method="POST"
            action={"/todos/" + todo.id + "/toggle"}
            style="display:inline"
            onSubmit={onToggleSubmit(todo.id)}
          >
            <button type="submit">{todo.done ? "✓" : "○"}</button>
          </form>{" "}
          <span style={todo.done ? "text-decoration: line-through" : ""}>{todo.text}</span>{" "}
          <form
            method="POST"
            action={"/todos/" + todo.id + "/delete"}
            style="display:inline"
            onSubmit={onDeleteSubmit(todo.id)}
          >
            <button type="submit">×</button>
          </form>
        </li>
      } }
    </ul>

    @{ if (todos.value.length === 0) <p>(empty)</p> }
  </div>
}
