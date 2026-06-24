import type { ReactNode } from 'react';

export interface KbdProps {
  /** Key label, e.g. "Ctrl" or "N". */
  children: ReactNode;
}

/**
 * A keyboard-key glyph for shortcut hints, e.g. `<Kbd>Ctrl</Kbd>+<Kbd>N</Kbd>`.
 */
export function Kbd({ children }: KbdProps) {
  return <kbd className="co-kbd">{children}</kbd>;
}
