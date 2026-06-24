import { EmptyState } from 'casual-office-ui';

export const NoRecents = () => (
  <div style={{ width: 480 }}>
    <EmptyState hint={<>You can also drag a <code>.docx</code> or <code>.xlsx</code> onto this window.</>}>
      No recent files yet — open one to get started.
    </EmptyState>
  </div>
);

export const NoMatch = () => (
  <div style={{ width: 480 }}>
    <EmptyState>No recent files match that search.</EmptyState>
  </div>
);
