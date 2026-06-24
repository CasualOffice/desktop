import { useEffect, useState, type ReactNode } from 'react';
import {
  ActionCard, Avatar, Button, CheckboxField, ContextMenu, EmptyState, Field,
  Kbd, Modal, RecentCard, SearchInput, SegmentedFilter, SettingsSection,
  TextInput, ThemeCard, Toast, Topbar, UserChip, VersionTag, WizardCard,
  WizardStepper,
} from '../src/index';
import { DocIcon, SheetIcon, OpenIcon } from './icons';

type Theme = 'system' | 'light' | 'dark';
type Filter = 'all' | 'docx' | 'sheets';

const RECENTS = [
  { name: 'Q3 board deck notes.docx', path: '~/Documents/Work', time: '2 hours ago', kind: 'docx' as const, pinned: true },
  { name: 'Budget 2026.xlsx', path: '~/Documents/Finance', time: 'Yesterday', kind: 'sheets' as const },
  { name: 'Offsite agenda.docx', path: '~/Desktop', time: 'Yesterday', kind: 'docx' as const },
  { name: 'Headcount model.xlsx', path: '~/Documents/Planning', time: 'Tue', kind: 'sheets' as const },
];

export function App() {
  const [theme, setTheme] = useState<Theme>('system');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const recents = RECENTS.filter(
    (r) => (filter === 'all' || r.kind === filter) && r.name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="co-root" style={{ minHeight: '100vh' }}>
      <Topbar
        brand="Casual Office"
        actions={<UserChip name="Sachin Sarwa" onClick={() => setModal(true)} />}
      />

      {/* ---- Reconstructed launcher home ------------------------------- */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 40px 56px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 className="co-h1" style={{ fontSize: 24, fontWeight: 600 }}>Welcome back, Sachin</h1>
          <p className="co-sub" style={{ fontSize: 13 }}>Open something, or start fresh.</p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }} aria-label="New document">
          <ActionCard tone="docx" icon={<DocIcon />} title="New document" subtitle="Blank .docx" />
          <ActionCard tone="sheets" icon={<SheetIcon />} title="New spreadsheet" subtitle="Blank .xlsx" />
          <ActionCard dashed icon={<OpenIcon />} title="Open file" subtitle=".docx, .xlsx, .ods, .csv, .tsv" />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <h2 className="co-eyebrow">Your files</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recent…" />
              <SegmentedFilter<Filter>
                aria-label="Filter by type"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'docx', label: 'Documents' },
                  { value: 'sheets', label: 'Spreadsheets' },
                ]}
              />
            </div>
          </div>

          {recents.length ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {recents.map((r) => (
                <RecentCard key={r.name} {...r} />
              ))}
            </div>
          ) : (
            <EmptyState hint={<>Try a different search.</>}>No recent files match that search.</EmptyState>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, paddingTop: 14, borderTop: '1px solid var(--co-line)', fontSize: 11, color: 'var(--co-muted)' }}>
            <span><Kbd>Ctrl</Kbd>+<Kbd>N</Kbd> New doc</span>
            <span><Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>N</Kbd> New sheet</span>
            <span><Kbd>Ctrl</Kbd>+<Kbd>O</Kbd> Open</span>
            <span><Kbd>Ctrl</Kbd>+<Kbd>,</Kbd> Settings</span>
          </div>
        </section>

        {/* ---- Component gallery --------------------------------------- */}
        <h2 className="co-eyebrow" style={{ marginTop: 16 }}>Component gallery</h2>

        <Panel title="Buttons">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="link">Link</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Panel>

        <Panel title="Appearance">
          <div className="co-theme-grid" style={{ maxWidth: 360 }}>
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <ThemeCard key={t} value={t} name="demo-theme" checked={theme === t} onSelect={setTheme} />
            ))}
          </div>
        </Panel>

        <Panel title="Settings & fields">
          <SettingsSection title="Profile">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <Avatar name="Sachin Sarwa" size="lg" />
              <Button variant="secondary">Change picture…</Button>
            </div>
            <Field label="Name"><TextInput defaultValue="Sachin Sarwa" /></Field>
            <Field label="Email" optional><TextInput type="email" placeholder="you@example.com" /></Field>
          </SettingsSection>
          <div style={{ height: 16 }} />
          <SettingsSection title="Privacy">
            <CheckboxField
              label="Privacy mode"
              description="Hide window contents from OS screenshots and screen recordings."
              checked={privacy}
              onChange={(e) => setPrivacy(e.target.checked)}
            />
          </SettingsSection>
        </Panel>

        <Panel title="Wizard step">
          <WizardCard total={3} current={1} className="" >
            <h1 className="co-h1">Welcome to Casual Office</h1>
            <p className="co-sub">A local-only editor for Word and Excel documents. Let's set you up.</p>
            <Field label="Your name"><TextInput placeholder="e.g. Sachin" /></Field>
            <div className="co-wiz-actions"><Button>Continue</Button></div>
          </WizardCard>
        </Panel>

        <Panel title="Feedback & overlays">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <Toast>Document saved</Toast>
            <Toast variant="success">Exported to PDF</Toast>
            <Toast variant="error">Save failed — disk full</Toast>
            <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
            <ContextMenu
              items={[
                { label: 'Open' },
                { label: 'Open in new window' },
                { label: 'Reveal in Finder' },
                { label: 'Remove from recents', danger: true },
              ]}
            />
          </div>
        </Panel>

        <Panel title="Misc">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span className="co-sub">About line <VersionTag>v0.1.0</VersionTag></span>
            <WizardStepper total={3} current={2} />
          </div>
        </Panel>
      </div>

      {modal && (
        <Modal
          title="Open where?"
          subtitle="Choose how to open this document."
          onClose={() => setModal(false)}
          hint="Esc to cancel · Enter to use this window"
          actions={
            <>
              <Button variant="link" onClick={() => setModal(false)}>Cancel</Button>
              <span className="co-spacer" />
              <Button variant="secondary">New window</Button>
              <Button onClick={() => setModal(false)}>This window</Button>
            </>
          }
        >
          <CheckboxField label="Don't ask again" description="Always open this way." />
        </Modal>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3 className="co-eyebrow" style={{ fontSize: 11 }}>{title}</h3>
      {children}
    </section>
  );
}
