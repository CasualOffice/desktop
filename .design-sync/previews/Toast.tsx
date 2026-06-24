import { Toast } from 'casual-office-ui';

export const Neutral = () => <Toast>Document saved</Toast>;
export const Success = () => <Toast variant="success">Exported to PDF</Toast>;
export const Error = () => <Toast variant="error">Save failed — disk full</Toast>;

export const Stack = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
    <Toast variant="success">Saved to ~/Documents/Q3.docx</Toast>
    <Toast>Copied path to clipboard</Toast>
    <Toast variant="error">Couldn't open file — not found</Toast>
  </div>
);
