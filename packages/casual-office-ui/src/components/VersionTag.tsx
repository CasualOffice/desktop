import type { ReactNode } from 'react';

export interface VersionTagProps {
  /** Version string, e.g. "v0.4.2". */
  children: ReactNode;
}

/**
 * A small monospace pill for a version label — used beside the app name in the
 * About section.
 */
export function VersionTag({ children }: VersionTagProps) {
  return <span className="co-version-tag">{children}</span>;
}
