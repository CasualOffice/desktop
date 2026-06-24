import type { ReactNode } from 'react';

export interface FieldProps {
  /** Field label shown above the control. */
  label: ReactNode;
  /** Marks the label with an "(optional)" suffix. */
  optional?: boolean;
  /** Help text shown below the control. */
  hint?: ReactNode;
  /** The control — typically a `TextInput`. */
  children: ReactNode;
  className?: string;
}

/**
 * A labeled form field: a small muted label above its control, with optional
 * "(optional)" tagging and a hint line below. Wraps the control in a `<label>`
 * so clicking the label focuses the input.
 */
export function Field({ label, optional, hint, children, className }: FieldProps) {
  const cls = className ? `co-field ${className}` : 'co-field';
  return (
    <label className={cls}>
      <span className="co-field-label">
        {label}
        {optional && <em className="co-field-optional"> (optional)</em>}
      </span>
      {children}
      {hint && <p className="co-hint">{hint}</p>}
    </label>
  );
}
