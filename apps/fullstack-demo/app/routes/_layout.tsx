// @ts-nocheck
// Root layout (= 全 routes で共通する HTML wrapper)。
// props.children = 子 route の c.render(<Page/>) の output Node。
export default component RootLayout(props) {
  <div class="hbn-root">
    <header>
      <nav>
        <a href="/">home</a>
        {" | "}
        <a href="/todos">todos</a>
        {" | "}
        <a href="/about">about</a>
      </nav>
    </header>
    <hr />
    {props.children}
    <hr />
    <footer>
      <small>© hibana fullstack-demo</small>
    </footer>
  </div>
}
