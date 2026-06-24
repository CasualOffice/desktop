import { Field, TextInput } from 'casual-office-ui';

export const Named = () => (
  <div style={{ width: 320 }}>
    <Field label="Your name">
      <TextInput defaultValue="Sachin" placeholder="e.g. Sachin" />
    </Field>
  </div>
);

export const Optional = () => (
  <div style={{ width: 320 }}>
    <Field label="Email" optional>
      <TextInput type="email" placeholder="you@example.com" />
    </Field>
  </div>
);

export const WithHint = () => (
  <div style={{ width: 320 }}>
    <Field label="Time zone" hint="Used as author metadata. Stored locally; never sent anywhere.">
      <TextInput defaultValue="America/New_York" />
    </Field>
  </div>
);
