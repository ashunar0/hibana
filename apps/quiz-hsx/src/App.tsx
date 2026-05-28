// @ts-nocheck
// hsx 版 Quiz: `component` + `@{ if-else if-else }` + `@{ for }` で書く。
// TS は `component` を理解しないので ts-nocheck (Phase 2 で SWC plugin 想定)。
import { Computed, Signal } from "hibana-core";
import { questions } from "./quiz-data.ts";

// step state: 0=intro, 1..N=Q1..QN, N+1=result
const TOTAL_STEPS = questions.length + 2;

const step = new Signal(0);
const answers = new Signal(Array(questions.length).fill(-1));
const score = new Computed(() =>
  answers.value.reduce(
    (acc, a, i) => acc + (a === questions[i].answerIndex ? 1 : 0),
    0,
  ),
);

component Intro() {
  <div>
    <h1>
      Hibana Quiz <span class="badge">hsx</span>
    </h1>
    <p>Hibana の基礎知識クイズなのだ！ 全 {questions.length} 問。</p>
    <div class="nav">
      <button type="button" onClick={() => step.value++}>start</button>
    </div>
  </div>
}

component QuestionView(props) {
  const q = questions[props.index];
  const select = (i) => {
    const next = [...answers.value];
    next[props.index] = i;
    answers.value = next;
    step.value++;
  };

  <div>
    <p>
      Q{props.index + 1} / {questions.length}
    </p>
    <h2>{q.text}</h2>
    @{ for (const [i, c] of q.choices.entries()) {
      <button class="choice" type="button" onClick={() => select(i)}>{c}</button>
    } }
  </div>
}

component Result() {
  const reset = () => {
    answers.value = Array(questions.length).fill(-1);
    step.value = 0;
  };

  <div>
    <h2>結果</h2>
    <p>
      正解: {score.value} / {questions.length}
    </p>
    @{ if (score.value === 3) <p>完璧！ 全問正解なのだ</p>
       else if (score.value === 2) <p>good! 惜しい (2/3)</p>
       else if (score.value === 1) <p>nice try (1/3)</p>
       else <p>oops... (0/3)</p> }
    <div class="nav">
      <button type="button" onClick={reset}>リトライ</button>
    </div>
  </div>
}

export component App() {
  <div>
    @{ if (step.value === 0) <Intro />
       else if (step.value === TOTAL_STEPS - 1) <Result />
       else <QuestionView index={step.value - 1} /> }
  </div>
}
