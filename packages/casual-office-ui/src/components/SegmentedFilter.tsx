export interface SegmentedOption<T extends string = string> {
  /** Stable value emitted on select. */
  value: T;
  /** Visible label. */
  label: string;
}

export interface SegmentedFilterProps<T extends string = string> {
  /** The segments, left to right. */
  options: SegmentedOption<T>[];
  /** Currently active value. */
  value: T;
  /** Fires with the chosen value. */
  onChange?: (value: T) => void;
  /** Accessible label for the group. */
  'aria-label'?: string;
}

/**
 * A small segmented control — the "All / Documents / Spreadsheets" filter over
 * the recent-files list. The active segment lifts onto the page background.
 */
export function SegmentedFilter<T extends string = string>({
  options,
  value,
  onChange,
  ...rest
}: SegmentedFilterProps<T>) {
  return (
    <div className="co-segmented" role="tablist" aria-label={rest['aria-label']}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={opt.value === value}
          className={`co-segmented-btn${opt.value === value ? ' co-segmented-btn--active' : ''}`}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
