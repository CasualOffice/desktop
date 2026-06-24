import { Modal, Button, CheckboxField } from 'casual-office-ui';

export const OpenWhere = () => (
  <Modal
    title="Open where?"
    subtitle="Choose how to open this document."
    hint="Esc to cancel · Enter to use this window"
    actions={
      <>
        <Button variant="link">Cancel</Button>
        <span className="co-spacer" />
        <Button variant="secondary">New window</Button>
        <Button>This window</Button>
      </>
    }
  >
    <CheckboxField label="Don't ask again" description="Always open this way." />
  </Modal>
);

export const WhatsNew = () => (
  <Modal
    wide
    title="What's new"
    subtitle="Casual Office v0.1.0"
    actions={
      <>
        <span className="co-spacer" />
        <Button>Got it</Button>
      </>
    }
  >
    <ul style={{ margin: '0 0 8px', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6, color: 'var(--co-fg)' }}>
      <li>One window per document, like native Office.</li>
      <li>Native save — no more browser downloads.</li>
      <li>Recent files with search and pinning.</li>
    </ul>
  </Modal>
);
