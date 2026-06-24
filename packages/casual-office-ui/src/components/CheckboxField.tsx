import type { InputHTMLAttributes, ReactNode } from 'react';

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Bold label beside the checkbox. */
  label: ReactNode;
  /** Muted description shown under the label. */
  description?: ReactNode;
}

/**
 * A checkbox with an aligned label and optional multi-line description — the
 * pattern used for the "Privacy mode" and "Remember my choice" settings.
 */
export function CheckboxField({ label, description, className, ...rest }: CheckboxFieldProps) {
  const cls = className ? `co-field-checkbox ${className}` : 'co-field-checkbox';
  return (
    <label className={cls}>
      <input type="checkbox" {...rest} />
      <span>
        <strong>{label}</strong>
        {description && <span className="co-checkbox-desc">{description}</span>}
      </span>
    </label>
  );
}
