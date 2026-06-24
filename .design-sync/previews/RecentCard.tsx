import { RecentCard } from 'casual-office-ui';

export const Document = () => (
  <div style={{ width: 300 }}>
    <RecentCard kind="docx" name="Q3 board deck notes.docx" path="~/Documents/Work" time="2 hours ago" />
  </div>
);
export const Spreadsheet = () => (
  <div style={{ width: 300 }}>
    <RecentCard kind="sheets" name="Budget 2026.xlsx" path="~/Documents/Finance" time="Yesterday" />
  </div>
);
export const Pinned = () => (
  <div style={{ width: 300 }}>
    <RecentCard kind="docx" name="Offsite agenda.docx" path="~/Desktop" time="Mon" pinned />
  </div>
);
export const Grid = () => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: 620 }}>
    <RecentCard kind="docx" name="Q3 board deck notes.docx" path="~/Documents/Work" time="2 hours ago" pinned />
    <RecentCard kind="sheets" name="Headcount model.xlsx" path="~/Documents/Planning" time="Tue" />
  </div>
);
