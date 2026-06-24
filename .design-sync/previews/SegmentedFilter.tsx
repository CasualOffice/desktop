import { SegmentedFilter } from 'casual-office-ui';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'docx', label: 'Documents' },
  { value: 'sheets', label: 'Spreadsheets' },
];

export const AllSelected = () => <SegmentedFilter options={OPTIONS} value="all" aria-label="Filter by type" />;
export const DocumentsSelected = () => <SegmentedFilter options={OPTIONS} value="docx" aria-label="Filter by type" />;
export const TwoUp = () => (
  <SegmentedFilter
    options={[{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }]}
    value="on"
    aria-label="Toggle"
  />
);
