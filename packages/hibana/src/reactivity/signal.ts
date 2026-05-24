import { type Subject, type Subscriber, notifySubscribers, track } from "./tracking.ts";

export class Signal<T> implements Subject {
  subscribers = new Set<Subscriber>();
  #value: T;

  constructor(initial: T) {
    this.#value = initial;
  }

  get value(): T {
    track(this);
    return this.#value;
  }

  set value(next: T) {
    if (Object.is(this.#value, next)) return;
    this.#value = next;
    notifySubscribers(this);
  }

  peek(): T {
    return this.#value;
  }
}
