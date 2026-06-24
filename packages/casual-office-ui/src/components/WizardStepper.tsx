export interface WizardStepperProps {
  /** Total number of steps. */
  total: number;
  /** Current step, 1-based. Dots up to and including this index are lit. */
  current: number;
  className?: string;
}

/**
 * The first-run wizard's progress indicator: a row of short bars that light up
 * in accent as the user advances through setup steps.
 */
export function WizardStepper({ total, current, className }: WizardStepperProps) {
  const cls = className ? `co-stepper ${className}` : 'co-stepper';
  return (
    <div className={cls} role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`co-stepper-dot${i < current ? ' co-stepper-dot--on' : ''}`} />
      ))}
    </div>
  );
}
