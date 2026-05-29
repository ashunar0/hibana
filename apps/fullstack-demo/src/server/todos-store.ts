// in-process state (= memory store)。 server 再起動でリセット OK、 dogfood の核は
// 「server state を form 経由で更新する流れ」 の証明。 永続化 (SQLite 等) は YAGNI。

export interface Todo {
  id: number;
  text: string;
  done: boolean;
}

let nextId = 1;
const todos: Todo[] = [
  { id: nextId++, text: "fullstack-demo を触ってみる", done: false },
  { id: nextId++, text: "hibana の README を読む", done: true },
];

export function listTodos(): Todo[] {
  return todos.map((t) => ({ ...t }));
}

export function addTodo(text: string): Todo | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const todo: Todo = { id: nextId++, text: trimmed, done: false };
  todos.push(todo);
  return { ...todo };
}

export function toggleTodo(id: number): Todo | null {
  const t = todos.find((x) => x.id === id);
  if (!t) return null;
  t.done = !t.done;
  return { ...t };
}

export function deleteTodo(id: number): boolean {
  const idx = todos.findIndex((x) => x.id === id);
  if (idx < 0) return false;
  todos.splice(idx, 1);
  return true;
}
