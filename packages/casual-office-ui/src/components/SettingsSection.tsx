import type { ReactNode } from 'react';

export interface SettingsSectionProps {
  /** Section heading, rendered as a small uppercase eyebrow. */
  title: ReactNode;
  /** Section body — fields, toggles, etc. */
  children: ReactNode;
  className?: string;
}

/**
 * A bordered card grouping related settings under an uppercase heading — the
 * Profile / Appearance / Files / Privacy / About blocks in the settings panel.
 */
export function SettingsSection({ title, children, className }: SettingsSectionProps) {
  const cls = className ? `co-settings-section ${className}` : 'co-settings-section';
  return (
    <section className={cls}>
      <h2 className="co-eyebrow">{title}</h2>
      {children}
    </section>
  );
}
