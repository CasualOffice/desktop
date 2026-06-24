export interface AvatarProps {
  /** Display name — used to derive initials when no image is given. */
  name?: string;
  /** Explicit initials override (1–2 chars). */
  initials?: string;
  /** Image URL for a profile picture; falls back to initials when absent. */
  src?: string;
  /** `lg` renders the 56px settings-page size; default is the 26px chip size. */
  size?: 'sm' | 'lg';
  className?: string;
}

function initialsFrom(name?: string): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

/**
 * Circular user avatar. Renders a profile image when `src` is set, otherwise
 * the user's initials on an accent-colored disc.
 */
export function Avatar({ name, initials, src, size = 'sm', className }: AvatarProps) {
  const cls = ['co-avatar', size === 'lg' && 'co-avatar--lg', className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {src ? <img src={src} alt={name ?? ''} /> : initials ?? initialsFrom(name)}
    </span>
  );
}
