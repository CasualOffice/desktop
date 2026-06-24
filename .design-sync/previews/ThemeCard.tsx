import { ThemeCard } from 'casual-office-ui';

export const Picker = () => (
  <div className="co-theme-grid" style={{ width: 360 }}>
    <ThemeCard value="system" name="t" checked />
    <ThemeCard value="light" name="t" />
    <ThemeCard value="dark" name="t" />
  </div>
);
export const Selected = () => (
  <div style={{ width: 120 }}>
    <ThemeCard value="dark" name="t2" checked />
  </div>
);
