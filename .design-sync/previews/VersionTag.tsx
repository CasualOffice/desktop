import { VersionTag } from 'casual-office-ui';

export const Default = () => <VersionTag>v0.1.0</VersionTag>;
export const InAboutLine = () => (
  <span style={{ fontSize: 13, color: 'var(--co-fg)' }}>
    <strong>Casual Office</strong> <VersionTag>v0.1.0</VersionTag>
  </span>
);
