import type { ReactNode } from 'react';

export interface WizardCardProps {
  /** Total wizard steps; when set, renders a `WizardStepper` at the top. */
  total?: number;
  /** Current 1-based step for the stepper. */
  current?: number;
  children: ReactNode;
  className?: string;
}

/**
 * The elevated card that frames each first-run wizard step — surface fill,
 * large radius, soft shadow — with an optional step indicator across the top.
 */
export function WizardCard({ total, current = 1, children, className }: WizardCardProps) {
  const cls = className ? `co-wiz-card ${className}` : 'co-wiz-card';
  return (
    <div className={cls}>
      {total ? (
        <div style={{ marginBottom: 24 }}>
          <WizardStepperInline total={total} current={current} />
        </div>
      ) : null}
      {children}
    </div>
  );
}

function WizardStepperInline({ total, current }: { total: number; current: number }) {
  return (
    <div className="co-stepper">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`co-stepper-dot${i < current ? ' co-stepper-dot--on' : ''}`} />
      ))}
    </div>
  );
}
