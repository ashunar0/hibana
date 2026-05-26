import { Signal } from "./signal.ts";

// Mutation<TInput, TResult> は副作用 (POST / PATCH / DELETE 等) を表す primitive。
// useQuery `useMutation` 相当の最小版。 楽観的更新の hook (onMutate / onError) を提供。
//
// onMutate: 実行直前に呼ばれ、 戻り値が ctx として onSuccess/onError に渡る。
//          典型は「Resource の prev value を返して onError で rollback」 パターン。
//
// design: Resource とは違って auto-refetch / dependency tracking は無い。
// signal 依存が変化したからといって再実行する意味の無い動詞 (mutation) なので、
// あくまで明示 `mutation.mutate(input)` で発火する形に絞る。
interface MutationOptions<TInput, TResult> {
  onMutate?: (input: TInput) => unknown;
  onSuccess?: (result: TResult, input: TInput, ctx: unknown) => void;
  onError?: (error: Error, input: TInput, ctx: unknown) => void;
}

export class Mutation<TInput, TResult> {
  #fn: (input: TInput) => Promise<TResult>;
  #options: MutationOptions<TInput, TResult>;
  #loadingSig = new Signal(false);
  #errorSig = new Signal<Error | null>(null);

  constructor(
    fn: (input: TInput) => Promise<TResult>,
    options: MutationOptions<TInput, TResult> = {},
  ) {
    this.#fn = fn;
    this.#options = options;
  }

  get loading(): boolean {
    return this.#loadingSig.value;
  }

  get error(): Error | null {
    return this.#errorSig.value;
  }

  async mutate(input: TInput): Promise<TResult> {
    this.#loadingSig.value = true;
    this.#errorSig.value = null;

    const ctx = this.#options.onMutate?.(input);

    try {
      const result = await this.#fn(input);
      this.#loadingSig.value = false;
      this.#options.onSuccess?.(result, input, ctx);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      this.#errorSig.value = err;
      this.#loadingSig.value = false;
      this.#options.onError?.(err, input, ctx);
      throw err;
    }
  }
}
