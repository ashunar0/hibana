// @ts-nocheck
// Pattern 3 syntax 専用デモ。 Vite plugin (hibana) が transform する前提。
// TS の type checker は `component` を理解しないので nocheck で抑制。
// (Phase 2 で SWC plugin に切替えると型完全保持できる予定 — 設計書 §7)
//
// 新 syntax (T15.6, 2026-05-24): `render { }` は廃止し、 `component` 本体全体が
// do-block として振る舞う。 body 末尾の JSX 式が自動 return される。
import {
  Computed,
  Mutation,
  Resource,
  Signal,
  Store,
  effect,
  onCleanup,
  onMount,
  untrack,
} from "hibana-core";

component CounterP3() {
  const count = new Signal(0);
  <button onClick={() => count.value++}>
    P3 Count: {count.value}
  </button>;
}

component AutoCounterP3() {
  const count = new Signal(0);
  const timer = setInterval(() => count.value++, 1000);
  onCleanup(() => clearInterval(timer));
  <p>P3 Auto-tick: {count.value}</p>;
}

// T16-MVP: @{ } 局所 do-block。 単一 expression (ternary) で DOM 切替
component ShowCaseP3() {
  const count = new Signal(0);
  <div>
    <button onClick={() => count.value++}>p3-show: {count.value}</button>
    @{ count.value === 0 ? <span>zero</span> : count.value % 2 === 0 ? <strong>even</strong> : <em>odd</em> }
  </div>;
}

// T16-b: @{ } 内に statement 列を書き、 末尾の式が auto-return される
component DoBlockP3() {
  const count = new Signal(0);
  <div>
    <button onClick={() => count.value++}>p3-do: {count.value}</button>
    @{
      const label = count.value % 2 === 0 ? "偶数" : "奇数";
      const cls = count.value > 5 ? "big" : "small";
      <p className={cls}>label={label}, size={cls}</p>
    }
  </div>;
}

// T16-c: @{ if-else } の block-as-expression。 handoff.md の例そのままを動かせる
component IfElseP3() {
  const count = new Signal(0);
  <div>
    <button onClick={() => count.value++}>p3-if: {count.value}</button>
    @{
      if (count.value === 0) <span>zero</span>
      else if (count.value % 2 === 0) <strong>even {count.value}</strong>
      else <em>odd {count.value}</em>
    }
  </div>;
}

// T18: Computed derived signal を component から使う
component ComputedP3() {
  const count = new Signal(1);
  const doubled = new Computed(() => count.value * 2);
  const quadrupled = new Computed(() => doubled.value * 2);
  <div>
    <button onClick={() => count.value++}>p3-computed: count={count.value}</button>
    <p>doubled={doubled.value}, quadrupled={quadrupled.value}</p>
  </div>;
}

// T18.5: glitch-free 強化 (3-state push-CHECK / pull-confirm) の dogfood。
// count を 1→2→3→... と回しても isPositive は true で同値なので effect runs は増えない。
// マイナス側に行ったとき isPositive が false に変わって初めて effect が再 run する。
component GlitchFreeP3() {
  const count = new Signal(1);
  const isPositive = new Computed(() => count.value > 0);
  const runs = new Signal(0);
  effect(() => {
    void isPositive.value;
    untrack(() => runs.value++);
  });
  <div>
    <button onClick={() => count.value++}>p3-glitch count++: {count.value}</button>
    <button onClick={() => (count.value -= 10)}>count -= 10</button>
    <p>
      isPositive={String(isPositive.value)}, effect runs={runs.value}
    </p>
  </div>;
}

// T19: Store deep reactive、 nested mutation で DOM 更新
component StoreP3() {
  const state = new Store({ user: { name: "Asahi", age: 25 }, count: 0 });
  <div>
    <button onClick={() => state.count++}>p3-store: count={state.count}</button>
    <button onClick={() => (state.user.name = state.user.name === "Asahi" ? "Yusuke" : "Asahi")}>
      toggle name
    </button>
    <p>user.name={state.user.name}, user.age={state.user.age}</p>
    <button onClick={() => (state.user = { name: "Reset", age: 0 })}>replace user</button>
  </div>;
}

// onMount: client only / 初回 microtask 1 回。 表示 element の text を後から書き換える
component OnMountP3() {
  const status = new Signal("waiting...");
  onMount(() => {
    status.value = "mounted!";
  });
  <p>p3-onMount: status={status.value}</p>;
}

// untrack: tracked dep と untracked dep を分けて、 後者は DOM 更新しない確認
component UntrackP3() {
  const tracked = new Signal(0);
  const ignored = new Signal(0);
  <div>
    <button onClick={() => tracked.value++}>p3-untrack tracked++: {tracked.value}</button>
    <button onClick={() => ignored.value++}>ignored++ (no rerender)</button>
    <p>
      tracked={tracked.value}, ignored snapshot=
      @{ untrack(() => ignored.value) }
    </p>
  </div>;
}

// T20: Resource async data + auto-refetch (id signal 変化で再 fetch)
component ResourceP3() {
  const id = new Signal(1);
  const user = new Resource(
    () => new Promise<string>((resolve) => {
      const currentId = id.value;
      setTimeout(() => resolve(`user-${currentId} (fetched at ${Date.now() % 100000})`), 600);
    }),
  );
  <div>
    <button onClick={() => (id.value = id.value === 1 ? 2 : 1)}>p3-resource toggle id (now {id.value})</button>
    <button onClick={() => user.refetch()}>refetch</button>
    @{
      if (user.loading) <p>loading...</p>
      else if (user.error) <p>error: {user.error.message}</p>
      else <p>value: {user.value}</p>
    }
  </div>;
}

// T20+: Mutation で楽観的更新 + rollback (50% で fake error → rollback)。
// Resource (post) を like ボタンで即時 +1、 サーバ失敗時は前の値に戻す
component OptimisticP3() {
  const post = new Resource<{ id: number; likes: number }>(
    () => Promise.resolve({ id: 1, likes: 10 }),
  );

  const like = new Mutation<void, { likes: number }>(
    () =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < 0.5) reject(new Error("server rejected"));
          else resolve({ likes: (post.peek()?.likes ?? 0) });
        }, 400);
      }),
    {
      onMutate: () => {
        const prev = post.peek();
        if (prev) post.mutate({ ...prev, likes: prev.likes + 1 });
        return prev; // rollback 用 snapshot
      },
      onError: (_err, _input, prev) => {
        post.mutate(prev as { id: number; likes: number } | undefined);
      },
    },
  );

  <div>
    <button onClick={() => { like.mutate().catch(() => {}); }}>♡ like (50% reject) likes={post.value?.likes ?? "..."}</button>
    @{
      if (like.loading) <p>mutating...</p>
      else if (like.error) <p>last attempt failed: {like.error.message} (rolled back)</p>
      else <p>last attempt: ok</p>
    }
  </div>;
}

// T22: TodoList 統合 demo — Store / Signal / Computed / @{} を全部使う
// list rendering は T9.7 (function child が array<Node> 返却) の上に成立
component TodoListP3() {
  type Todo = { id: number; text: string; done: boolean };
  const state = new Store<{ items: Todo[]; filter: "all" | "active" | "done" }>({
    items: [
      { id: 1, text: "Phase 1.5 終わらせる", done: true },
      { id: 2, text: "level 1.5 (Mutation + 楽観的更新)", done: true },
      { id: 3, text: "T22 統合 demo", done: false },
      { id: 4, text: "記事化", done: false },
    ],
    filter: "all",
  });
  const input = new Signal("");
  let nextId = 5;

  const remaining = new Computed(() => state.items.filter((t) => !t.done).length);

  const visible = new Computed(() =>
    state.items.filter((t) =>
      state.filter === "all" ? true : state.filter === "active" ? !t.done : t.done,
    ),
  );

  const add = () => {
    const text = input.value.trim();
    if (!text) return;
    state.items.push({ id: nextId++, text, done: false });
    input.value = "";
  };

  <div>
    <form
      onSubmit={(e: Event) => {
        e.preventDefault();
        add();
      }}
    >
      <input
        value={input.value}
        onInput={(e: Event) => (input.value = (e.target as HTMLInputElement).value)}
        placeholder="add a todo"
      />
      <button type="submit">add</button>
    </form>
    <div>
      filter:
      <button onClick={() => (state.filter = "all")}>all</button>
      <button onClick={() => (state.filter = "active")}>active</button>
      <button onClick={() => (state.filter = "done")}>done</button>
      <span> (now: {state.filter})</span>
    </div>
    <ul>
      @{ for (const item of visible.value)
        <li style={item.done ? "text-decoration: line-through" : ""}>
          <input
            type="checkbox"
            checked={item.done}
            onChange={() => {
              const target = state.items.find((t) => t.id === item.id);
              if (target) target.done = !target.done;
            }}
          />
          {" "}{item.text}{" "}
          <button onClick={() => {
            const i = state.items.findIndex((t) => t.id === item.id);
            if (i >= 0) state.items.splice(i, 1);
          }}>x</button>
        </li>
      }
    </ul>
    <p>
      {remaining.value} remaining / {state.items.length} total
    </p>
  </div>;
}

// View Transitions API dogfood: signal 変更を `document.startViewTransition` で wrap
// するだけで、 DOM 切替に browser 標準の fade animation が乗る。
// 「signal は state を変える、 animation は browser に任せる」 という分担の dogfood。
component ViewTransitionP3() {
  const count = new Signal(0);

  const onClick = () => {
    if (typeof document.startViewTransition === "function") {
      document.startViewTransition(async () => {
        count.value++;
        // Hibana scheduler は microtask 遅延なので、 callback 内で signal.set した直後は
        // まだ DOM 反映されていない。 1 microtask 待ってから resolve することで、
        // startViewTransition が「DOM 変更完了」 を正しく検出できる。
        await new Promise((r) => queueMicrotask(r));
      });
    } else {
      count.value++;
    }
  };

  <div>
    <button onClick={onClick}>p3-viewtransition increment ({count.value})</button>
    <div className="vt-target">
      @{ if (count.value === 0) <span>zero</span>
         else if (count.value % 2 === 0) <strong>even {count.value}</strong>
         else <em>odd {count.value}</em> }
    </div>
  </div>;
}

// Form dogfood: 複数 field controlled input + onSubmit + 結果プレビュー。
// Signal ×4 (name / email / message / submitted) + @{ if-else } で submit 状態の分岐表示
component FormP3() {
  const name = new Signal("");
  const email = new Signal("");
  const message = new Signal("");
  const submitted = new Signal<{ name: string; email: string; message: string } | null>(null);

  const onSubmit = (e: Event) => {
    e.preventDefault();
    submitted.value = { name: name.value, email: email.value, message: message.value };
  };

  <form onSubmit={onSubmit}>
    <p>
      <label>p3-form name: </label>
      <input value={name.value} onInput={(e) => (name.value = e.currentTarget.value)} />
    </p>
    <p>
      <label>email: </label>
      <input value={email.value} onInput={(e) => (email.value = e.currentTarget.value)} />
    </p>
    <p>
      <label>message: </label>
      <textarea value={message.value} onInput={(e) => (message.value = e.currentTarget.value)}></textarea>
    </p>
    <button type="submit">submit</button>
    <p>preview: name={name.value} / email={email.value} / message={message.value}</p>
    @{ if (submitted.value) <p>submitted: {JSON.stringify(submitted.value)}</p>
       else <p>not submitted yet</p> }
  </form>;
}

// Dark mode toggle: Signal + onMount (localStorage 読み込み) + effect (DOM + localStorage 書き込み)
// 主軸方針「動的なら JS で書く」 の延長で、 side effect (document.documentElement.dataset / localStorage)
// は effect 内に閉じて signal-native に書ける、 ことの dogfood
component DarkModeP3() {
  const theme = new Signal<"light" | "dark">("light");

  onMount(() => {
    const saved = localStorage.getItem("hibana-theme");
    if (saved === "light" || saved === "dark") theme.value = saved;
  });

  effect(() => {
    document.documentElement.dataset.theme = theme.value;
    localStorage.setItem("hibana-theme", theme.value);
  });

  <div>
    <button onClick={() => (theme.value = theme.value === "light" ? "dark" : "light")}>
      p3-darkmode toggle (now: {theme.value})
    </button>
  </div>;
}

export {
  CounterP3,
  AutoCounterP3,
  ShowCaseP3,
  DoBlockP3,
  IfElseP3,
  ComputedP3,
  GlitchFreeP3,
  StoreP3,
  OnMountP3,
  UntrackP3,
  ResourceP3,
  OptimisticP3,
  TodoListP3,
  DarkModeP3,
  FormP3,
  ViewTransitionP3,
};
