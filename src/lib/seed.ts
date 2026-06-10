import { getCategories, addCategory, getClients, addClient, getAppSettings, updateAppSettings, getTaxSettings, setTaxSettings, getVerticals, addVertical } from './storage';
import type { Category, ClientVertical } from '@/types';

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Client Payment In', type: 'income', is_custom: false },
  { name: 'Salaries', type: 'expense', is_custom: false, description: 'Staff salaries and wages' },
  { name: 'Freelancer Fees', type: 'expense', is_custom: false, description: 'Payments to freelancers' },
  { name: 'Software & Tools', type: 'expense', is_custom: false, description: 'SaaS subscriptions, apps' },
  { name: 'Office Rent', type: 'expense', is_custom: false },
  { name: 'Utilities', type: 'expense', is_custom: false, description: 'Electricity, internet, phone' },
  { name: 'Marketing & Ads', type: 'expense', is_custom: false, description: 'Paid ads, promotions' },
  { name: 'Travel', type: 'expense', is_custom: false, description: 'Cab, auto, travel for work' },
  { name: 'Food & Cafes', type: 'expense', is_custom: false, description: 'Team meals, client entertainment' },
  { name: 'Equipment', type: 'expense', is_custom: false, description: 'Camera, gear, hardware' },
  { name: 'Professional Fees', type: 'expense', is_custom: false, description: 'CA, legal, consultant fees' },
  { name: 'Shoot Costs', type: 'expense', is_custom: false, description: 'Photo/video shoot expenses' },
  { name: 'Videography', type: 'expense', is_custom: false, description: 'Videographer hire, video production' },
  { name: 'Photography', type: 'expense', is_custom: false, description: 'Photographer hire' },
  { name: 'Editing', type: 'expense', is_custom: false, description: 'Video/photo editing costs' },
  { name: 'Printing & Stationery', type: 'expense', is_custom: false },
  { name: 'Bank Charges', type: 'expense', is_custom: false },
  { name: 'Taxes', type: 'expense', is_custom: false },
  { name: 'Vendor Payment', type: 'expense', is_custom: false, description: 'Third-party vendor payments' },
  { name: 'Props & Styling', type: 'expense', is_custom: false, description: 'Shoot props, wardrobe, styling' },
  { name: 'Content Creation', type: 'expense', is_custom: false, description: 'UGC, influencer, content costs' },
  { name: 'Owner Drawing', type: 'expense', is_custom: false },
  { name: 'Internal Transfer', type: 'both', is_custom: false },
  { name: 'Petty Cash', type: 'both', is_custom: false },
  { name: 'Miscellaneous', type: 'both', is_custom: false },
  { name: 'Other', type: 'both', is_custom: false },
];

const DEFAULT_VERTICALS: Omit<ClientVertical, 'is_custom'>[] = [
  { id: 'restaurants', label: 'Restaurants & Food' },
  { id: 'menswear', label: 'Luxury Menswear' },
  { id: 'weddings', label: 'Weddings' },
  { id: 'jewellery', label: 'Jewellery' },
  { id: 'real_estate', label: 'Real Estate' },
  { id: 'healthcare', label: 'Healthcare' },
  { id: 'other', label: 'Other' },
];

export function seedDefaultData(): void {
  if (getCategories().length === 0) {
    DEFAULT_CATEGORIES.forEach(cat => addCategory(cat));
  }

  if (getVerticals().length === 0) {
    DEFAULT_VERTICALS.forEach(v => addVertical({ ...v }));
  }

  if (getClients().length === 0) {
    addClient({ name: 'Tissera', vertical: 'menswear', retainer_amount: 75000, billing_cycle: 'monthly', payment_method: 'Bank Transfer', contact: 'Tissera Team', start_date: '2024-01-01', status: 'active', fixed_cost_items: [
      { id: crypto.randomUUID(), label: 'Shoot', estimated_amount: 15000, category_id: '', is_variable: true },
      { id: crypto.randomUUID(), label: 'Content Manager', estimated_amount: 8000, category_id: '', is_variable: false },
    ]});
    addClient({ name: 'Mantras Pure Veg', vertical: 'restaurants', retainer_amount: 35000, billing_cycle: 'monthly', payment_method: 'UPI', contact: 'Mantras Team', start_date: '2023-06-01', status: 'active', fixed_cost_items: [
      { id: crypto.randomUUID(), label: 'Shoot', estimated_amount: 8000, category_id: '', is_variable: true },
    ]});
    addClient({ name: 'Saffron by Anu', vertical: 'restaurants', retainer_amount: 25000, billing_cycle: 'monthly', payment_method: 'UPI', contact: 'Anu', start_date: '2024-03-01', status: 'active', fixed_cost_items: [] });
  }

  if (!getTaxSettings()) {
    setTaxSettings({ id: crypto.randomUUID(), business_structure: 'partnership', gstin: '', pan: '', fy_start: 'April', gst_rate: 18, state: 'Tamil Nadu' });
  }

  const settings = getAppSettings();
  if (!settings.cash_holder) updateAppSettings({ cash_holder: 'Shlok' });
}
