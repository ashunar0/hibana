// @ts-nocheck
// LikeButton island = post 詳細 page の「👍 いいね」 ボタン。
//
// 両 mode 連続:
// - JS off path: <form method="POST" action="/posts/:slug/like"> の native submit
//   → server が 303 redirect → 詳細 page 再 SSR で count 反映 (= form の素朴な動き)
// - JS on path: onSubmit を e.preventDefault() で intercept → Mutation.mutate
//   onMutate で count +1 (= 楽観反映、 ボタン押した瞬間に UI 更新)
//   fetch で server に POST、 onSuccess で server 確定 count を反映、 onError で rollback
//
// server endpoint (/posts/:slug/like) は Accept: application/json で JSON / 303 分岐、
// 同じ handler が両 mode 動く。
import { Mutation, Signal } from "hibana-core";

export component LikeButton(props) {
  const count = new Signal(props.initialCount ?? 0);

  const likeMutation = new Mutation(
    async () => {
      const res = await fetch("/posts/" + props.slug + "/like", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("like failed: " + res.status);
      const data = await res.json();
      return data.count;
    },
    {
      onMutate: () => {
        const prev = count.value;
        count.value = prev + 1;
        return { prev };
      },
      onSuccess: (next) => {
        count.value = next;
      },
      onError: (_err, _input, ctx) => {
        count.value = ctx.prev;
      },
    },
  );

  const onSubmit = (e) => {
    e.preventDefault();
    likeMutation.mutate();
  };

  <form
    method="POST"
    action={"/posts/" + props.slug + "/like"}
    onSubmit={onSubmit}
    class="mt-6 inline-block"
  >
    <button
      type="submit"
      class="px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    >
      👍 いいね <span class="ml-1 text-gray-500 dark:text-gray-400">{count.value}</span>
    </button>
  </form>
}
