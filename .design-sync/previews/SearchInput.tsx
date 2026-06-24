import { SearchInput } from 'casual-office-ui';

export const Empty = () => (
  <div style={{ width: 280 }}>
    <SearchInput placeholder="Search recent…" />
  </div>
);
export const WithQuery = () => (
  <div style={{ width: 280 }}>
    <SearchInput defaultValue="budget" placeholder="Search recent…" />
  </div>
);
