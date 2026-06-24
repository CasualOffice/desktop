import { WizardCard, Field, TextInput, Button } from 'casual-office-ui';

export const Welcome = () => (
  <WizardCard total={3} current={1}>
    <h1 className="co-h1">Welcome to Casual Office</h1>
    <p className="co-sub">A local-only editor for Word and Excel documents. Let's set you up.</p>
    <Field label="Your name"><TextInput placeholder="e.g. Sachin" /></Field>
    <Field label="Email" optional><TextInput type="email" placeholder="you@example.com" /></Field>
    <div className="co-wiz-actions"><Button>Continue</Button></div>
  </WizardCard>
);

export const LastStep = () => (
  <WizardCard total={3} current={3}>
    <h1 className="co-h1">One last thing</h1>
    <p className="co-sub">Where should we save new documents by default?</p>
    <Field label="Default folder"><TextInput readOnly placeholder="(use system default)" /></Field>
    <div className="co-wiz-actions">
      <Button variant="secondary">Back</Button>
      <Button>Finish setup</Button>
    </div>
  </WizardCard>
);
