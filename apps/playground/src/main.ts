import { Signal, jsx, onCleanup } from "hibana";

// Pattern 3 構文 (compiler 未実装) を jsx() 直叩きで再現:
//
//   component Counter() {
//     const count = new Signal(0)
//     render {
//       <button onClick={() => count.value++}>
//         Count: {count.value}
//       </button>
//     }
//   }
function Counter(): Node {
  const count = new Signal(0);
  return jsx("button", { onClick: () => count.value++ }, "Count: ", () => count.value);
}

// onMount/onCleanup の動作確認: 1 秒ごとに自動 increment する demo
function AutoCounter(): Node {
  const count = new Signal(0);
  const timer = setInterval(() => count.value++, 1000);
  onCleanup(() => clearInterval(timer));

  return jsx("p", null, "Auto-tick: ", () => count.value);
}

const app = document.querySelector("#app");
if (app) {
  app.append(
    jsx("h1", null, "Hibana playground"),
    jsx("p", null, "手書き JSX (compiler 抜き) で reactive UI が動く確認"),
    Counter(),
    AutoCounter(),
  );
}
