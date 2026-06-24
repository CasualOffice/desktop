export interface ThemeCardProps {
  /** Theme this card selects. */
  value: 'system' | 'light' | 'dark';
  /** Visible label; defaults to a capitalized `value`. */
  label?: string;
  /** Radio group name — cards sharing a name are mutually exclusive. */
  name?: string;
  /** Whether this card is the selected one. */
  checked?: boolean;
  /** Fires with `value` when the card is chosen. */
  onSelect?: (value: 'system' | 'light' | 'dark') => void;
}

const LABELS = { system: 'System', light: 'Light', dark: 'Dark' } as const;

/**
 * A selectable theme swatch — a radio card showing a light / dark / split
 * preview. Render three in a `.co-theme-grid` for the appearance picker.
 */
export function ThemeCard({ value, label, name = 'theme', checked, onSelect }: ThemeCardProps) {
  return (
    <label className="co-theme-card">
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={() => onSelect?.(value)}
      />
      <span className={`co-theme-preview co-theme-preview--${value}`} />
      <span>{label ?? LABELS[value]}</span>
    </label>
  );
}
