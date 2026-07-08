export interface Customer {
  id: string;
  brand_id: string | null;
  name: string;
  phone: string;
  phone_secondary: string;
  address: string;
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
  notes: string;
  created_at: string;
  updated_at: string;
  last_order_at: string | null;
  order_count: number;
  record_source: 'customers' | 'orders';
}

export interface CustomerUpsertInput {
  id?: string;
  brand_id: string;
  name: string;
  phone: string;
  phone_secondary: string;
  address: string;
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
  notes: string;
}