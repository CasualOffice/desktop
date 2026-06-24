import type { ButtonHTMLAttributes } from 'react';
import { Avatar } from './Avatar';

export interface UserChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** User's display name — shown beside the avatar and used for initials. */
  name: string;
  /** Optional avatar image URL. */
  avatarSrc?: string;
}

/**
 * The pill-shaped profile button in the top-right of the workspace: a small
 * avatar plus the user's name, opening profile & settings on click.
 */
export function UserChip({ name, avatarSrc, className, ...rest }: UserChipProps) {
  const cls = className ? `co-user-chip ${className}` : 'co-user-chip';
  return (
    <button type="button" className={cls} {...rest}>
      <Avatar name={name} src={avatarSrc} />
      <span>{name}</span>
    </button>
  );
}
