import { expect, test } from "vite-plus/test";
import { Mutation } from "../../src/reactivity/mutation.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test("initial state: loading=false, error=null", () => {
  const m = new Mutation(async (x: number) => x * 2);
  expect(m.loading).toBe(false);
  expect(m.error).toBeNull();
});

test("mutate(input) resolves with result and toggles loading", async () => {
  const m = new Mutation(async (x: number) => x * 2);
  const promise = m.mutate(5);
  expect(m.loading).toBe(true);

  const result = await promise;
  expect(result).toBe(10);
  expect(m.loading).toBe(false);
  expect(m.error).toBeNull();
});

test("mutate(input) rejects with error and sets errorSig", async () => {
  const m = new Mutation(async () => {
    throw new Error("boom");
  });
  await expect(m.mutate(undefined)).rejects.toThrow("boom");
  expect(m.loading).toBe(false);
  expect(m.error?.message).toBe("boom");
});

test("onMutate is called with input before fn runs", async () => {
  const calls: string[] = [];
  const m = new Mutation(
    async (input: string) => {
      calls.push(`fn:${input}`);
      return input.toUpperCase();
    },
    {
      onMutate: (input) => {
        calls.push(`onMutate:${input}`);
      },
    },
  );
  await m.mutate("hi");
  expect(calls).toEqual(["onMutate:hi", "fn:hi"]);
});

test("onSuccess receives result, input, ctx (ctx from onMutate)", async () => {
  let captured: { result: number; input: number; ctx: unknown } | undefined;
  const m = new Mutation(async (x: number) => x + 1, {
    onMutate: (input) => ({ snapshot: input * 100 }),
    onSuccess: (result, input, ctx) => {
      captured = { result, input, ctx };
    },
  });
  await m.mutate(3);
  expect(captured).toEqual({ result: 4, input: 3, ctx: { snapshot: 300 } });
});

test("onError receives error, input, ctx (rollback pattern)", async () => {
  let rolledBack: unknown;
  const m = new Mutation<string, void>(
    async (_input) => {
      throw new Error("server-rejected");
    },
    {
      onMutate: (input) => `prev-state-for-${input}`,
      onError: (_err, _input, ctx) => {
        rolledBack = ctx;
      },
    },
  );
  await expect(m.mutate("X")).rejects.toThrow();
  expect(rolledBack).toBe("prev-state-for-X");
});

test("in-flight mutation: loading reflects async pending", async () => {
  const d = deferred<number>();
  const m = new Mutation(() => d.promise);
  const promise = m.mutate(undefined);
  expect(m.loading).toBe(true);

  d.resolve(7);
  await promise;
  expect(m.loading).toBe(false);
});

test("error state is cleared on next successful mutate", async () => {
  let failNext = true;
  const m = new Mutation(async () => {
    if (failNext) {
      failNext = false;
      throw new Error("first");
    }
    return "ok";
  });
  await expect(m.mutate(undefined)).rejects.toThrow();
  expect(m.error?.message).toBe("first");

  const result = await m.mutate(undefined);
  expect(result).toBe("ok");
  expect(m.error).toBeNull();
});
