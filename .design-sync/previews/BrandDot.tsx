import { BrandDot } from 'casual-office-ui';

export const Default = () => <BrandDot />;
export const Large = () => <BrandDot size={32} />;
export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <BrandDot size={14} />
    <BrandDot size={20} />
    <BrandDot size={28} />
    <BrandDot size={40} />
  </div>
);
export const InBrand = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
    <BrandDot />
    <span>Casual Office</span>
  </div>
);
