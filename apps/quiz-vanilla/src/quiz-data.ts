// Hibana 知識 quiz の問題データ。 quiz-vanilla と quiz-hsx の両 app で完全同一。

export type Question = {
  text: string;
  choices: string[];
  answerIndex: number;
};

export const questions: Question[] = [
  {
    text: "Hibana の Signal で現在値を取得するアクセス方法は？",
    choices: [".get()", ".value", ".read()"],
    answerIndex: 1,
  },
  {
    text: "JSX の中に if-else を block-as-expression として書ける Hibana の主軸 syntax は？",
    choices: ["<Show when={...}>", "@{ if ... else ... }", "render { }"],
    answerIndex: 1,
  },
  {
    text: "component が DOM mount 後に 1 回だけ走る lifecycle は？",
    choices: ["useEffect(fn, [])", "onMount(fn)", "componentDidMount()"],
    answerIndex: 1,
  },
];
