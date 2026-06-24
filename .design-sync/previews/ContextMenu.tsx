import { ContextMenu } from 'casual-office-ui';

export const RecentFile = () => (
  <div style={{ width: 220 }}>
    <ContextMenu
      items={[
        { label: 'Open' },
        { label: 'Open in new window' },
        { label: 'Reveal in Finder' },
        { label: 'Copy path' },
        { label: 'Remove from recents', danger: true },
      ]}
    />
  </div>
);

export const Short = () => (
  <div style={{ width: 220 }}>
    <ContextMenu items={[{ label: 'Pin to top' }, { label: 'Rename…' }, { label: 'Delete', danger: true }]} />
  </div>
);
