import { Avatar } from 'casual-office-ui';

export const Initials = () => <Avatar name="Sachin Sarwa" />;
export const Large = () => <Avatar name="Sachin Sarwa" size="lg" />;
export const SingleName = () => <Avatar name="Mia" />;
export const Row = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    <Avatar name="Ada Lovelace" />
    <Avatar name="Grace Hopper" />
    <Avatar name="Alan Turing" size="lg" />
  </div>
);
