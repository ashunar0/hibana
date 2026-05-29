// @ts-nocheck
// / (home) page。 server で listPosts() を取って <SearchBox/> に initialPosts として渡す。
// page entry 自体は依然 static (signal を持たない) なので client JS は出ない、
// 子 SearchBox だけが interactive 判定で per-island chunk になる。
import { SearchBox } from "./SearchBox.tsx";

export component HomePage(props) {
  <section>
    <h2 class="text-xl font-semibold mb-4">記事一覧</h2>
    <SearchBox initialPosts={props.posts} />
  </section>
}
