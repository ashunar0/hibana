// `@{ ... }` (JSX 内局所 do-block) は valid JS じゃないので Babel parser を通せない。
// pre-process で `{(() => ...)}` (JSX expression container + arrow thunk) に展開する。
//
// MVP (T16-a): `@{ expr }` 単一 expression のみ対応。
//   `<div>@{ count.value > 0 ? <A/> : <B/> }</div>` →
//   `<div>{(() => count.value > 0 ? <A/> : <B/>)}</div>`
//
// 出力は JSX expression container 込みなので JSX 外で書くと parse error になる
// (`const x = @{...}` のような書き方は仕様外、 MVP 制約)。
// JSX runtime の reactive Node-child binding (T9.6) と組み合わせて条件分岐 DOM 切替を実現する。
// 末尾 expression auto-return (statement 列対応) と if-else expression 化は T16-b / T16-c に持ち越し。
//
// 注意:
// - 文字列リテラル / template / コメント内の `@{` は無視 (誤マッチ回避)
// - `@` の直前が word char (`email@example` 等) なら無視
// - brace matching は 文字列/コメント を skip しながら `{` `}` で深さ判定 (JSX 内 `{}` も正しく対応)

export function transformAtBlock(source: string): string {
  let result = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];

    // 文字列 / template literal
    if (c === '"' || c === "'" || c === "`") {
      const end = scanString(source, i);
      result += source.slice(i, end);
      i = end;
      continue;
    }

    // line comment
    if (c === "/" && source[i + 1] === "/") {
      const end = scanLineComment(source, i);
      result += source.slice(i, end);
      i = end;
      continue;
    }

    // block comment
    if (c === "/" && source[i + 1] === "*") {
      const end = scanBlockComment(source, i);
      result += source.slice(i, end);
      i = end;
      continue;
    }

    // @{ check
    if (c === "@" && source[i + 1] === "{") {
      const prev = i > 0 ? source[i - 1] : "";
      if (/\w/.test(prev)) {
        result += c;
        i++;
        continue;
      }
      const bodyEnd = findMatchingBrace(source, i + 2);
      const body = source.slice(i + 2, bodyEnd).trim();
      // JSX expression container 込みで wrap (JSX 内に置かれることを前提とする)
      result += `{(() => ${body})}`;
      i = bodyEnd + 1;
      continue;
    }

    result += c;
    i++;
  }
  return result;
}

/** `i` を opening quote の index として、 closing quote の **次の index** を返す。 */
function scanString(source: string, i: number): number {
  const close = source[i];
  let j = i + 1;
  while (j < source.length && source[j] !== close) {
    if (source[j] === "\\") {
      j += 2;
      continue;
    }
    j++;
  }
  return j + 1;
}

/** `i` を `//` の index として、 行末の **次の index** (`\n` を含む) を返す。 */
function scanLineComment(source: string, i: number): number {
  let j = i + 2;
  while (j < source.length && source[j] !== "\n") j++;
  return j;
}

/** `i` を `/*` の index として、 `*\/` の **次の index** を返す。 */
function scanBlockComment(source: string, i: number): number {
  let j = i + 2;
  while (j < source.length - 1 && !(source[j] === "*" && source[j + 1] === "/")) j++;
  return j + 2;
}

/**
 * `start` を `@{` の `{` の **次の index** (= body 開始位置) として、
 * 対応する `}` の index を返す。 文字列/コメント内の `{` `}` は count しない。
 */
function findMatchingBrace(source: string, start: number): number {
  let depth = 1;
  let j = start;
  while (j < source.length) {
    const c = source[j];
    if (c === '"' || c === "'" || c === "`") {
      j = scanString(source, j);
      continue;
    }
    if (c === "/" && source[j + 1] === "/") {
      j = scanLineComment(source, j);
      continue;
    }
    if (c === "/" && source[j + 1] === "*") {
      j = scanBlockComment(source, j);
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return j;
    }
    j++;
  }
  throw new Error("@{ } の対応する閉じ括弧が見つかりません");
}
