import { BootSkeleton } from 'casual-office-ui';

export const Default = () => (
  <div style={{ width: 520, height: 240, border: '1px solid var(--co-line)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
    <BootSkeleton />
  </div>
);

export const CustomLabel = () => (
  <div style={{ width: 520, height: 240, border: '1px solid var(--co-line)', borderRadius: 8, overflow: 'hidden', display: 'flex' }}>
    <BootSkeleton label="Loading your documents…" />
  </div>
);
