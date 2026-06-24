import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Visual variant:
   * - `primary` (default) — solid accent, the page's main action.
   * - `secondary` — surface fill with a hairline border.
   * - `link` — text-only accent button.
   * - `icon` — quiet icon affordance (muted, transparent until hover).
   */
  variant?: 'primary' | 'secondary' | 'link' | 'icon';
  children?: ReactNode;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: '',
  secondary: 'co-btn--secondary',
  link: 'co-btn--link',
  icon: 'co-btn--icon',
};

/**
 * The Casual Office button. One component covers all four variants used across
 * the launcher: primary calls-to-action, secondary actions, inline text links,
 * and quiet icon buttons.
 */
export function Button({ variant = 'primary', className, type = 'button', children, ...rest }: ButtonProps) {
  const cls = ['co-btn', VARIANT_CLASS[variant], className].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {children}
    </button>
  );
}
