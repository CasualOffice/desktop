import { CheckboxField } from 'casual-office-ui';

export const Privacy = () => (
  <div style={{ width: 420 }}>
    <CheckboxField
      label="Privacy mode"
      description="Hide window contents from OS screenshots and screen recordings. Honored on Windows and macOS."
    />
  </div>
);
export const Remember = () => (
  <div style={{ width: 420 }}>
    <CheckboxField defaultChecked label="Don't ask again" description="Always open documents this way." />
  </div>
);
