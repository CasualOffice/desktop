import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Primary message. */
  children: ReactNode;
  /** Muted hint line under the message. */
  hint?: ReactNode;
  className?: string;
}

/**
 * A dashed-border placeholder for empty regions — e.g. "No recent files yet."
 * Use `<code>` inside the hint for inline shortcuts or paths.
 */
export function EmptyState({ children, hint, className }: EmptyStateProps) {
  const cls = className ? `co-empty ${className}` : 'co-empty';
  return (
    <div className={cls}>
      <p style={{ margin: 0 }}>{children}</p>
      {hint && <p className="co-hint">{hint}</p>}
    </div>
  );
}
