import { WizardStepper } from 'casual-office-ui';

export const StepOne = () => <WizardStepper total={3} current={1} />;
export const StepTwo = () => <WizardStepper total={3} current={2} />;
export const Complete = () => <WizardStepper total={3} current={3} />;
export const Progression = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <WizardStepper total={3} current={1} />
    <WizardStepper total={3} current={2} />
    <WizardStepper total={3} current={3} />
  </div>
);
