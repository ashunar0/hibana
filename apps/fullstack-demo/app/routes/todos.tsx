// @ts-nocheck
import { createRoute } from "hibana/factory";
import { TodoListPage } from "../../src/TodoListPage.tsx";
import { addTodo, listTodos } from "../../src/server/todos-store.ts";

// GET /todos = TodoList page
export default createRoute((c) => c.render(<TodoListPage todos={listTodos()} />));

// POST /todos = add (form action)
export const POST = createRoute(async (c) => {
  const body = await c.req.parseBody();
  const text = String(body.text ?? "");
  addTodo(text);
  return c.redirect("/todos", 303);
});
