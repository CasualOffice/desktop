import type { InputHTMLAttributes } from 'react';

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {}

/**
 * A pill-shaped search field with a leading magnifier icon — the recent-files
 * search box. Forwards native input props; the focus ring lifts to the whole
 * pill.
 */
export function SearchInput({ className, placeholder = 'Search…', ...rest }: SearchInputProps) {
  const cls = className ? `co-search ${className}` : 'co-search';
  return (
    <label className={cls}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
      <input type="text" placeholder={placeholder} {...rest} />
    </label>
  );
}
