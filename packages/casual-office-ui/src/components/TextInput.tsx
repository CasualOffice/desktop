import type { InputHTMLAttributes } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {}

/**
 * Single-line text input with the Casual Office focus ring. Forwards every
 * native input attribute (`value`, `placeholder`, `readOnly`, `type`, …).
 */
export function TextInput({ className, type = 'text', ...rest }: TextInputProps) {
  const cls = className ? `co-input ${className}` : 'co-input';
  return <input type={type} className={cls} {...rest} />;
}
