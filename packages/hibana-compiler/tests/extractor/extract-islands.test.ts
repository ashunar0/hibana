// extractIslands の動作確認: inline source + helper 除外 + 本物 hsx (quiz-hsx)

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractIslands, formatIslands } from "../../src/extractor/extract-islands.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const quizHsxApp = resolve(__dirname, "../../../../apps/quiz-hsx/src/App.tsx");

describe("extractIslands", () => {
  it("inline source からの抽出: name / props / interactive 構造", () => {
    const source = `
      import { Signal } from "hibana-core";

      component Counter() {
        const c = new Signal(0);
        <button>{c.value}</button>
      }

      function helper() { return 1; }

      component Greet(props) {
        <p>Hello {props.name}</p>
      }

      component WithDestructure({ title, count }) {
        <div>{title}: {count}</div>
      }
    `;
    const islands = extractIslands(source);
    expect(islands.map((i) => i.name)).toEqual(["Counter", "Greet", "WithDestructure"]);
    expect(islands[0]?.props).toEqual([]);
    expect(islands[1]?.props).toEqual(["props"]);
    expect(islands[2]?.props).toEqual(["title", "count"]);
    // Counter は reactive read を含むので interactive、 Greet / WithDestructure は static
    expect(islands[0]?.interactive).toBe(true);
    expect(islands[1]?.interactive).toBe(false);
    expect(islands[2]?.interactive).toBe(false);
  });

  it("helper function や useFoo は除外される (marker comment が無いから)", () => {
    const source = `
      function MyHelper() { return 1; }
      const Header = () => 2;
      const useTheme = () => 3;
      component RealComponent() { <div/> }
    `;
    const islands = extractIslands(source);
    expect(islands.map((i) => i.name)).toEqual(["RealComponent"]);
  });

  it("quiz-hsx App.tsx の 4 component を抽出 (本物 hsx ソース)", async () => {
    const source = await readFile(quizHsxApp, "utf8");
    const islands = extractIslands(source);

    expect(islands.map((i) => i.name)).toEqual(["Intro", "QuestionView", "Result", "App"]);
    expect(islands.find((i) => i.name === "QuestionView")?.props).toEqual(["props"]);
    expect(islands.find((i) => i.name === "App")?.props).toEqual([]);

    // 人間可読な出力 (vp test -- --reporter=verbose で見える)
    console.log(`\n${formatIslands(islands, "quiz-hsx/App.tsx")}\n`);
  });
});
