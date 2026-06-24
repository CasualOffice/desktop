import { ActionCard } from 'casual-office-ui';

const DocIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" />
  </svg>
);
const SheetIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 3v18" />
  </svg>
);
const OpenIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const NewDocument = () => (
  <div style={{ width: 280 }}>
    <ActionCard tone="docx" icon={<DocIcon />} title="New document" subtitle="Blank .docx" />
  </div>
);
export const NewSpreadsheet = () => (
  <div style={{ width: 280 }}>
    <ActionCard tone="sheets" icon={<SheetIcon />} title="New spreadsheet" subtitle="Blank .xlsx" />
  </div>
);
export const OpenFile = () => (
  <div style={{ width: 280 }}>
    <ActionCard dashed icon={<OpenIcon />} title="Open file" subtitle=".docx, .xlsx, .ods, .csv, .tsv" />
  </div>
);
export const Row = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: 760 }}>
    <ActionCard tone="docx" icon={<DocIcon />} title="New document" subtitle="Blank .docx" />
    <ActionCard tone="sheets" icon={<SheetIcon />} title="New spreadsheet" subtitle="Blank .xlsx" />
    <ActionCard dashed icon={<OpenIcon />} title="Open file" subtitle=".docx, .xlsx, .ods, .csv" />
  </div>
);
