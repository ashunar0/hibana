export interface Schedulable {
  run(): void;
}

let queue = new Set<Schedulable>();
let scheduled = false;

export function schedule(task: Schedulable): void {
  queue.add(task);
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flushSync);
  }
}

export function flushSync(): void {
  scheduled = false;
  if (queue.size === 0) return;

  // queue を入れ替えてから iterate: flush 中の schedule() は次の microtask に持ち越す
  const current = queue;
  queue = new Set();

  for (const task of current) {
    try {
      task.run();
    } catch (e) {
      console.error(e);
    }
  }
}
