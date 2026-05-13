interface Props {
  total: number;
  current: number; // 1-based
}

export default function StepIndicator({ total, current }: Props) {
  return (
    <div className="quiz__step-indicator" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={
            'quiz__step-dot' + (i < current ? ' quiz__step-dot--active' : '')
          }
        />
      ))}
    </div>
  );
}
