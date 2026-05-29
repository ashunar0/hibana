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

export function addTodo(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  todos.push({ id: nextId++, text: trimmed, done: false });
}

export function toggleTodo(id: number): void {
  const t = todos.find((x) => x.id === id);
  if (t) t.done = !t.done;
}

export function deleteTodo(id: number): void {
  const idx = todos.findIndex((x) => x.id === id);
  if (idx >= 0) todos.splice(idx, 1);
}
