import type { ReactNode } from 'react';

export interface ToastProps {
  /** Message text. */
  children: ReactNode;
  /**
   * Tone:
   * - `neutral` (default) — inverted fg/bg chip.
   * - `success` — green.
   * - `error` — red.
   */
  variant?: 'neutral' | 'success' | 'error';
}

const VARIANT_CLASS = { neutral: '', success: 'co-toast--success', error: 'co-toast--error' } as const;

/**
 * A transient feedback chip shown bottom-right after an action (saved, export
 * failed, …). Render inside your own fixed toast stack.
 */
export function Toast({ children, variant = 'neutral' }: ToastProps) {
  const cls = ['co-toast', VARIANT_CLASS[variant]].filter(Boolean).join(' ');
  return (
    <div className={cls} role="status">
      {children}
    </div>
  );
}
