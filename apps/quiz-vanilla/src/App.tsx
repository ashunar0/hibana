import { Computed, Signal } from "hibana-core";
import { questions } from "./quiz-data.ts";

// step state: 0=intro, 1..N=Q1..QN, N+1=result
const TOTAL_STEPS = questions.length + 2;

const step = new Signal(0);
const answers = new Signal<number[]>(Array(questions.length).fill(-1));
const score = new Computed(() =>
  answers.value.reduce((acc, a, i) => acc + (a === questions[i]!.answerIndex ? 1 : 0), 0),
);

function Intro() {
  return (
    <div>
      <h1>
        Hibana Quiz <span class="badge">vanilla JSX</span>
      </h1>
      <p>Hibana の基礎知識クイズなのだ！ 全 {questions.length} 問。</p>
      <div class="nav">
        <button type="button" onClick={() => step.value++}>
          start
        </button>
      </div>
    </div>
  );
}

function QuestionView(props: { index: number }) {
  const q = questions[props.index]!;
  const select = (i: number) => {
    const next = [...answers.value];
    next[props.index] = i;
    answers.value = next;
    step.value++;
  };
  return (
    <div>
      <p>
        Q{props.index + 1} / {questions.length}
      </p>
      <h2>{q.text}</h2>
      {q.choices.map((c, i) => (
        <button class="choice" type="button" onClick={() => select(i)}>
          {c}
        </button>
      ))}
    </div>
  );
}

function Result() {
  const reset = () => {
    answers.value = Array(questions.length).fill(-1);
    step.value = 0;
  };
  return (
    <div>
      <h2>結果</h2>
      <p>
        正解: {() => score.value} / {questions.length}
      </p>
      <p>
        {() =>
          score.value === 3
            ? "完璧！ 全問正解なのだ"
            : score.value === 2
              ? "good! 惜しい (2/3)"
              : score.value === 1
                ? "nice try (1/3)"
                : "oops... (0/3)"
        }
      </p>
      <div class="nav">
        <button type="button" onClick={reset}>
          リトライ
        </button>
      </div>
    </div>
  );
}

export function App() {
  return (
    <div>
      {() =>
        step.value === 0 ? (
          <Intro />
        ) : step.value === TOTAL_STEPS - 1 ? (
          <Result />
        ) : (
          <QuestionView index={step.value - 1} />
        )
      }
    </div>
  );
}
