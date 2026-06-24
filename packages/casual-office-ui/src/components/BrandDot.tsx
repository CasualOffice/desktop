import type { CSSProperties } from 'react';

export interface BrandDotProps {
  /** Square size in pixels. Default 14. */
  size?: number;
  /** Corner radius in pixels. Defaults to a size-proportional value. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * The Casual Office brand mark — a rounded square with the signature
 * docx→sheets diagonal gradient. Used in the topbar, boot screen, and
 * "what's new" header.
 */
export function BrandDot({ size = 14, radius, className, style }: BrandDotProps) {
  const cls = className ? `co-brand-dot ${className}` : 'co-brand-dot';
  return (
    <span
      aria-hidden="true"
      className={cls}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.29), ...style }}
    />
  );
}
