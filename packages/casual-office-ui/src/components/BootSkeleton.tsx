import type { ReactNode } from 'react';
import { BrandDot } from './BrandDot';

export interface BootSkeletonProps {
  /** Label under the pulsing brand dot. Defaults to "Casual Office". */
  label?: ReactNode;
}

/**
 * The full-bleed boot screen shown for the ~300 ms before settings resolve — a
 * gently pulsing brand dot beside the app name, so the user never sees an empty
 * body flash.
 */
export function BootSkeleton({ label = 'Casual Office' }: BootSkeletonProps) {
  return (
    <div className="co-boot-skeleton">
      <BrandDot size={32} />
      <span className="co-boot-label">{label}</span>
    </div>
  );
}
