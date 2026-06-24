import { TextInput } from 'casual-office-ui';

export const Default = () => (
  <div style={{ width: 320 }}>
    <TextInput placeholder="Search recent…" />
  </div>
);
export const Filled = () => (
  <div style={{ width: 320 }}>
    <TextInput defaultValue="Budget 2026.xlsx" />
  </div>
);
export const ReadOnly = () => (
  <div style={{ width: 320 }}>
    <TextInput readOnly value="~/Documents (use system default)" />
  </div>
);
