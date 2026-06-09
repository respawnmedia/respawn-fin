import { getCategories, addCategory, getClients, addClient, getAppSettings, updateAppSettings, getTaxSettings, setTaxSettings } from './storage';
import type { Category } from '@/types';

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Client Payment In', type: 'income', is_custom: false },
  { name: 'Salaries', type: 'expense', is_custom: false },
  { name: 'Software & Tools', type: 'expense', is_custom: false },
  { name: 'Office Rent', type: 'expense', is_custom: false },
  { name: 'Utilities', type: 'expense', is_custom: false },
  { name: 'Marketing & Ads', type: 'expense', is_custom: false },
  { name: 'Travel', type: 'expense', is_custom: false },
  { name: 'Food & Cafes', type: 'expense', is_custom: false },
  { name: 'Equipment', type: 'expense', is_custom: false },
  { name: 'Professional Fees', type: 'expense', is_custom: false },
  { name: 'Bank Charges', type: 'expense', is_custom: false },
  { name: 'Taxes', type: 'expense', is_custom: false },
  { name: 'Vendor Payment', type: 'expense', is_custom: false },
  { name: 'Owner Drawing', type: 'expense', is_custom: false },
  { name: 'Internal Transfer', type: 'both', is_custom: false },
  { name: 'Petty Cash', type: 'both', is_custom: false },
  { name: 'Other', type: 'both', is_custom: false },
];

export function seedDefaultData(): void {
  // Seed categories if empty
  if (getCategories().length === 0) {
    DEFAULT_CATEGORIES.forEach(cat => addCategory(cat));
  }

  // Seed sample clients if empty
  if (getClients().length === 0) {
    addClient({
      name: 'Tissera',
      vertical: 'menswear',
      retainer_amount: 75000,
      billing_cycle: 'monthly',
      payment_method: 'Bank Transfer',
      gstin: '',
      contact: 'Tissera Team',
      start_date: '2024-01-01',
      status: 'active',
    });
    addClient({
      name: 'Mantras Pure Veg',
      vertical: 'restaurants',
      retainer_amount: 35000,
      billing_cycle: 'monthly',
      payment_method: 'UPI',
      gstin: '',
      contact: 'Mantras Team',
      start_date: '2023-06-01',
      status: 'active',
    });
    addClient({
      name: 'Saffron by Anu',
      vertical: 'restaurants',
      retainer_amount: 25000,
      billing_cycle: 'monthly',
      payment_method: 'UPI',
      gstin: '',
      contact: 'Anu',
      start_date: '2024-03-01',
      status: 'active',
    });
  }

  // Seed tax settings if empty
  if (!getTaxSettings()) {
    setTaxSettings({
      id: crypto.randomUUID(),
      business_structure: 'partnership',
      gstin: '',
      pan: '',
      fy_start: 'April',
      gst_rate: 18,
      state: 'Tamil Nadu',
    });
  }

  // Ensure settings have defaults
  const settings = getAppSettings();
  if (!settings.cash_holder) {
    updateAppSettings({ cash_holder: 'Shlok' });
  }
}
