import type { ReactNode } from 'react';

export interface ModalProps {
  /** Dialog heading. */
  title: ReactNode;
  /** Sub-line under the title. */
  subtitle?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Footer content — typically `Button`s in a `.co-modal-actions` row. */
  actions?: ReactNode;
  /** Small right-aligned hint under the actions (e.g. keyboard shortcuts). */
  hint?: ReactNode;
  /** Wider variant for richer dialogs like "What's new". */
  wide?: boolean;
  /** Fires when the backdrop is clicked. */
  onClose?: () => void;
}

/**
 * A centered dialog over a dimmed backdrop. Provide `title`/`subtitle`,
 * `children` for the body, and `actions` for the footer button row. Clicking
 * the backdrop (not the card) fires `onClose`.
 */
export function Modal({ title, subtitle, children, actions, hint, wide, onClose }: ModalProps) {
  return (
    <div className="co-modal-backdrop" onClick={onClose}>
      <div
        className={`co-modal${wide ? ' co-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="co-modal-title">{title}</h2>
        {subtitle && <p className="co-modal-sub">{subtitle}</p>}
        {children}
        {actions && <div className="co-modal-actions">{actions}</div>}
        {hint && <p className="co-modal-hint">{hint}</p>}
      </div>
    </div>
  );
}
