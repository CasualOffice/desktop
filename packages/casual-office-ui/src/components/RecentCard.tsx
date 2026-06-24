import type { ButtonHTMLAttributes } from 'react';

export interface RecentCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** File name, e.g. "Q3 report.docx". */
  name: string;
  /** Full or shortened path shown under the name. */
  path?: string;
  /** Relative time, e.g. "2 hours ago". */
  time?: string;
  /** File kind — drives the colored file-icon. */
  kind?: 'docx' | 'sheets';
  /** Pinned files get a warm border and a pin glyph. */
  pinned?: boolean;
}

/**
 * A recent-file tile: a colored file icon, the file name, its path, and the
 * last-opened time. Pinned files get a warm border accent.
 */
export function RecentCard({ name, path, time, kind, pinned, className, ...rest }: RecentCardProps) {
  const cls = ['co-recent-card', pinned && 'co-recent-card--pinned', className].filter(Boolean).join(' ');
  const iconCls = ['co-recent-icon', kind && `co-recent-icon--${kind}`].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      <span className={iconCls} aria-hidden="true" />
      <span className="co-recent-meta">
        <span className="co-recent-name">
          {pinned && <span className="co-pin-mark">★</span>}
          {name}
        </span>
        {path && <span className="co-recent-path">{path}</span>}
        {time && <span className="co-recent-time" style={{ display: 'block' }}>{time}</span>}
      </span>
    </button>
  );
}
