// @ts-nocheck
import { createRoute } from "hibana/factory";
import { TodoListPage } from "../../src/TodoListPage.tsx";
import { addTodo, listTodos } from "../../src/server/todos-store.ts";

const wantsJson = (c) => (c.req.header("Accept") ?? "").includes("application/json");

// GET /todos = TodoList page (Accept: application/json なら JSON list = SPA Resource fetch 用)
export default createRoute((c) => {
  const todos = listTodos();
  if (wantsJson(c)) {
    return c.json({ todos });
  }
  return c.render(<TodoListPage todos={todos} />);
});

// POST /todos = add (form action / fetch 両対応)
export const POST = createRoute(async (c) => {
  const body = await c.req.parseBody();
  const text = String(body.text ?? "");
  const todo = addTodo(text);
  if (wantsJson(c)) {
    return c.json({ todo });
  }
  return c.redirect("/todos", 303);
});
