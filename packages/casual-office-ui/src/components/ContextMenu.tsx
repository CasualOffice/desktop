import type { ReactNode } from 'react';

export interface ContextMenuItem {
  /** Item label. */
  label: ReactNode;
  /** Click handler. */
  onSelect?: () => void;
  /** Renders the item in the danger color (e.g. "Remove from recents"). */
  danger?: boolean;
}

export interface ContextMenuProps {
  /** Menu rows, top to bottom. */
  items: ContextMenuItem[];
  className?: string;
}

/**
 * A floating right-click menu — a rounded surface card of selectable rows.
 * Position it yourself (it renders in normal flow); used by the recent-files
 * list. `danger` items take the red accent.
 */
export function ContextMenu({ items, className }: ContextMenuProps) {
  const cls = className ? `co-context-menu ${className}` : 'co-context-menu';
  return (
    <div className={cls} role="menu">
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={`co-context-menu-item${it.danger ? ' co-context-menu-item--danger' : ''}`}
          onClick={it.onSelect}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
