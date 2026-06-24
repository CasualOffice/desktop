import { Button } from 'casual-office-ui';

export const Primary = () => <Button>Save changes</Button>;
export const Secondary = () => <Button variant="secondary">Cancel</Button>;
export const Link = () => <Button variant="link">Re-run setup wizard</Button>;
export const Disabled = () => <Button disabled>Save changes</Button>;

export const Row = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button variant="secondary">Back</Button>
    <Button>Continue</Button>
  </div>
);
