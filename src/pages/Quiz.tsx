import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUESTIONS, TOTAL_STEPS } from '../data/questions';
import type { AnswerMap } from '../data/questions';
import StepIndicator from '../components/StepIndicator';
import { useSeo } from '../lib/seo';

export default function Quiz() {
  useSeo({
    title: '映画診断スタート | mood-cinema',
    description: '5 つの質問に答えると、今夜観るべき映画 5 本がわかります。',
  });
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});

  const q = QUESTIONS[step];
  const selected = answers[q.key];

  const choose = (value: string) => {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    if (step + 1 < TOTAL_STEPS) {
      setStep(step + 1);
    } else {
      const search = new URLSearchParams(
        Object.entries(next).filter(([, v]) => v !== undefined) as [string, string][],
      );
      navigate(`/result?${search.toString()}`);
    }
  };

  return (
    <div className="container quiz">
      <StepIndicator total={TOTAL_STEPS} current={step + 1} />
      <p className="quiz__hint" style={{ marginTop: 0, marginBottom: 12 }}>
        Step {step + 1} / {TOTAL_STEPS}
      </p>
      <h1 className="quiz__question">{q.question}</h1>
      {q.hint && <p className="quiz__hint">{q.hint}</p>}
      <div className="quiz__options">
        {q.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={
              'quiz__option' + (selected === opt.value ? ' quiz__option--selected' : '')
            }
            onClick={() => choose(opt.value)}
          >
            {opt.emoji && <span className="quiz__option-emoji" aria-hidden>{opt.emoji}</span>}
            <span className="quiz__option-text">
              {opt.label}
              {opt.hint && <small>{opt.hint}</small>}
            </span>
          </button>
        ))}
      </div>
      <div className="quiz__nav">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          戻る
        </button>
      </div>
    </div>
  );
}
