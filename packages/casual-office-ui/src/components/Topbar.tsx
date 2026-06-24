import type { ReactNode } from 'react';
import { BrandDot } from './BrandDot';

export interface TopbarProps {
  /** Brand/app name shown beside the brand dot. */
  brand: ReactNode;
  /** Right-aligned content — typically a `UserChip`. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The workspace top bar: the brand dot + app name on the left, optional
 * actions (e.g. the user chip) on the right, over a subtle surface.
 */
export function Topbar({ brand, actions, className }: TopbarProps) {
  const cls = className ? `co-topbar ${className}` : 'co-topbar';
  return (
    <header className={cls}>
      <div className="co-topbar-brand">
        <BrandDot />
        <span>{brand}</span>
      </div>
      {actions}
    </header>
  );
}
