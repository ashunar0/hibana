// @ts-nocheck
// Global error page。 setupHibana が getErrorPage() で拾って app.onError に配線、
// status 500 が立つ。 props.error にスローされた値が来る (= Error 型と仮定)。
export default component ErrorPage(props) {
  <main>
    <h1>500 — Error</h1>
    <p>サーバでエラーが起きたのだ。 詳細は以下なのだ。</p>
    <pre>{props.error?.message ?? String(props.error)}</pre>
  </main>
}
