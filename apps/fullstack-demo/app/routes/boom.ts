import { createRoute } from "hibana/factory";

// _error.tsx の確認用。 アクセスすると常に throw、 onError で ErrorPage が render される。
export default createRoute(() => {
  throw new Error("意図的な kaboom (= _error.tsx のテスト用)");
});
