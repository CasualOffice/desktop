import { SettingsSection, Field, TextInput, CheckboxField, Avatar, Button } from 'casual-office-ui';

export const Profile = () => (
  <div style={{ width: 480 }}>
    <SettingsSection title="Profile">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
        <Avatar name="Sachin Sarwa" size="lg" />
        <Button variant="secondary">Change picture…</Button>
      </div>
      <Field label="Name"><TextInput defaultValue="Sachin Sarwa" /></Field>
      <Field label="Email" optional><TextInput type="email" placeholder="you@example.com" /></Field>
    </SettingsSection>
  </div>
);

export const Privacy = () => (
  <div style={{ width: 480 }}>
    <SettingsSection title="Privacy">
      <CheckboxField
        label="Privacy mode"
        description="Hide window contents from OS screenshots and screen recordings."
      />
    </SettingsSection>
  </div>
);
