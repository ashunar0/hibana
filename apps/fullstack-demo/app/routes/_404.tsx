// @ts-nocheck
// Global not-found page。 setupHibana が getNotFound() で拾って app.notFound に配線、
// status 404 が立つ。 layout (_layout.tsx) で wrap される。
export default component NotFound() {
  <main>
    <h1>404 — Not Found</h1>
    <p>そのページは存在しないのだ。 nav から戻るのだ。</p>
  </main>
}
