import { Kbd } from 'casual-office-ui';

export const SingleKey = () => <Kbd>Ctrl</Kbd>;
export const Combo = () => (
  <span style={{ fontSize: 12, color: 'var(--co-muted)' }}>
    <Kbd>Ctrl</Kbd>+<Kbd>N</Kbd> New doc
  </span>
);
export const Hints = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 11, color: 'var(--co-muted)' }}>
    <span><Kbd>Ctrl</Kbd>+<Kbd>N</Kbd> New doc</span>
    <span><Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>N</Kbd> New sheet</span>
    <span><Kbd>Ctrl</Kbd>+<Kbd>O</Kbd> Open</span>
    <span><Kbd>Ctrl</Kbd>+<Kbd>,</Kbd> Settings</span>
  </div>
);
