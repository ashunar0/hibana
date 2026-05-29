// MPA-style partial swap helper。 framework に組み込まない sample 側 helper。
//
// 仕組み:
// 1. document 全体で click を listen、 同一 origin の `<a href>` を catch
// 2. fetch に `X-Hibana-Partial: main` header 付き → hibana middleware が
//    layout wrap / HTML template wrap を skip して fragment 直返し (= server CPU 節約 + bytes 節約)
// 3. 既存 <main> の innerHTML を差し替え、 history.pushState で URL 更新
// 4. View Transitions API が使える browser なら startViewTransition で wrap (= 滑らか)
// 5. mountIslands の MutationObserver (T32.1) が新 <hbn-island> を auto-hydrate
//
// shell (= _layout.tsx 内の header / nav / footer / 将来のサイドバー) は server で
// 再 render すらされない (= partial response の効果)、 client DOM も触られないので、
// signal state が navigate を跨いで保持される (= 「full reload しない」 の核)。
//
// 外部 link / target=_blank / 修飾 key click は intercept せず browser native に委ねる。

const PARTIAL_HEADER = "X-Hibana-Partial";

function shouldIntercept(e: MouseEvent, a: HTMLAnchorElement): boolean {
  if (a.target && a.target !== "_self") return false;
  if (a.origin !== location.origin) return false;
  if (e.defaultPrevented) return false;
  if (e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  return true;
}

async function swap(url: string, push: boolean): Promise<void> {
  let fragment: string;
  try {
    const res = await fetch(url, { headers: { [PARTIAL_HEADER]: "main" } });
    if (!res.ok) {
      location.href = url;
      return;
    }
    fragment = await res.text();
  } catch {
    location.href = url;
    return;
  }

  const main = document.querySelector("main");
  if (!main) {
    location.href = url;
    return;
  }

  const doSwap = (): void => {
    main.innerHTML = fragment;
  };

  if ("startViewTransition" in document) {
    (
      document as Document & {
        startViewTransition: (cb: () => void) => unknown;
      }
    ).startViewTransition(doSwap);
  } else {
    doSwap();
  }

  if (push) history.pushState({}, "", url);
}

document.addEventListener("click", (e) => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  const a = target.closest("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return;
  if (!shouldIntercept(e, a)) return;
  e.preventDefault();
  void swap(a.href, true);
});

window.addEventListener("popstate", () => {
  void swap(location.href, false);
});
