import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ActionCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  /** Card heading, e.g. "New document". */
  title: ReactNode;
  /** Secondary line under the title, e.g. "Blank .docx". */
  subtitle?: ReactNode;
  /** Leading glyph — typically a 20px stroked SVG icon. */
  icon?: ReactNode;
  /**
   * Accent treatment of the icon tile:
   * - `docx` — blue document accent.
   * - `sheets` — green spreadsheet accent.
   * - `neutral` (default) — subtle gray tile.
   */
  tone?: 'docx' | 'sheets' | 'neutral';
  /** Dashed border, used for the "Open file" verb card. */
  dashed?: boolean;
}

const ICON_TONE = { docx: 'co-card-icon--docx', sheets: 'co-card-icon--sheets', neutral: '' } as const;

/**
 * A large home-screen action card: icon tile, title, and subtitle in a row.
 * Used for "New document", "New spreadsheet", and the dashed "Open file" card.
 */
export function ActionCard({
  title,
  subtitle,
  icon,
  tone = 'neutral',
  dashed,
  className,
  ...rest
}: ActionCardProps) {
  const cls = ['co-card', dashed && 'co-card--dashed', className].filter(Boolean).join(' ');
  const iconCls = ['co-card-icon', ICON_TONE[tone]].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon && <span className={iconCls} aria-hidden="true">{icon}</span>}
      <span>
        <span className="co-card-title">{title}</span>
        {subtitle && <span className="co-card-sub" style={{ display: 'block' }}>{subtitle}</span>}
      </span>
    </button>
  );
}
