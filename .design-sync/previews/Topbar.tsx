import { Topbar, UserChip } from 'casual-office-ui';

export const WithUser = () => (
  <div style={{ width: 760, border: '1px solid var(--co-line)', borderRadius: 8, overflow: 'hidden' }}>
    <Topbar brand="Casual Office" actions={<UserChip name="Sachin Sarwa" />} />
  </div>
);

export const BrandOnly = () => (
  <div style={{ width: 760, border: '1px solid var(--co-line)', borderRadius: 8, overflow: 'hidden' }}>
    <Topbar brand="Casual Office" />
  </div>
);
