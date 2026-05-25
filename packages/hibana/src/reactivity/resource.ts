import { effect } from "./effect.ts";
import { Signal } from "./signal.ts";

// Resource<T> は async data の client cache primitive (設計書 §4.4)。
// - .value / .loading / .error は全 reactive read
// - fetcher 内で読まれた signal の変化で自動 refetch
// - .refetch() は内部 trigger signal を notify する形で「自動 refetch と同じ pipeline」 で実装
// - race condition: #version token で「新 fetch 開始時の version != resolve 時の現 version」 を判定し、
//   古い promise の結果は捨てる (MVP、 AbortController 統合は Phase 2)
export class Resource<T> {
  #fetcher: () => Promise<T>;
  #valueSig = new Signal<T | undefined>(undefined);
  #loadingSig = new Signal<boolean>(true);
  #errorSig = new Signal<Error | null>(null);
  #trigger = new Signal(0);
  #version = 0;

  constructor(fetcher: () => Promise<T>) {
    this.#fetcher = fetcher;
    // effect 内で fetcher を呼ぶことで signal 依存が track される。
    // trigger も track して refetch() で同じ pipeline を発火させる
    effect(() => {
      // dep を確実に track するため明示 read
      void this.#trigger.value;
      this.#run();
    });
  }

  get value(): T | undefined {
    return this.#valueSig.value;
  }

  get loading(): boolean {
    return this.#loadingSig.value;
  }

  get error(): Error | null {
    return this.#errorSig.value;
  }

  peek(): T | undefined {
    return this.#valueSig.peek();
  }

  refetch(): void {
    this.#trigger.value++;
  }

  // cache を直接書き換える。 楽観的更新の核 (useQuery setQueryData 相当)。
  // in-flight な fetch が後で resolve しても捨てる (#version++) のがポイント:
  // mutate で書いた値が古い fetch resolve で上書きされる事故を防ぐ。
  mutate(newValue: T | undefined): void {
    this.#version++;
    this.#valueSig.value = newValue;
    this.#loadingSig.value = false;
    this.#errorSig.value = null;
  }

  #run(): void {
    const myVersion = ++this.#version;
    this.#loadingSig.value = true;
    this.#errorSig.value = null;

    let promise: Promise<T>;
    try {
      promise = this.#fetcher();
    } catch (e) {
      this.#errorSig.value = toError(e);
      this.#loadingSig.value = false;
      return;
    }

    promise
      .then((value) => {
        if (myVersion !== this.#version) return;
        this.#valueSig.value = value;
        this.#loadingSig.value = false;
      })
      .catch((err) => {
        if (myVersion !== this.#version) return;
        this.#errorSig.value = toError(err);
        this.#loadingSig.value = false;
      });
  }
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
