import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrationssupabase/types';
import { isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { useSupabaseRealtimeRefresh } from '@/hooks/useSupabaseRealtimeRefresh';
import { getLocalDemoOrders } from '@/lib/demoOrders';
import { Customer, CustomerUpsertInput } from '@/types/customer';
import { compactWhitespace, extractLegacyOrderMetadata, normalizePhone, parseDetailedAddress } from '@/lib/utils';

type CustomerStorageMode = 'customers' | 'orders';
type CustomerRow = Database['public']['Tables']['customers']['Row'];
type OrderCustomerAnalyticsRow = Pick<Database['public']['Tables']['orders']['Row'], 'id' | 'brand_id' | 'customer_name' | 'phone' | 'address' | 'notes' | 'created_at'>;

function isMissingCustomersTableError(message: string) {
  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('customers') && (
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('schema cache') ||
    normalizedMessage.includes('relation')
  );
}

function sortCustomers(list: Customer[]) {
  return [...list].sort((left, right) => {
    const leftTimestamp = new Date(left.last_order_at ?? left.updated_at ?? left.created_at).getTime();
    const rightTimestamp = new Date(right.last_order_at ?? right.updated_at ?? right.created_at).getTime();
    return rightTimestamp - leftTimestamp;
  });
}

function mergeCustomer(list: Customer[], nextCustomer: Customer) {
  const next = list.filter(customer => customer.id !== nextCustomer.id && !(customer.brand_id === nextCustomer.brand_id && normalizePhone(customer.phone) === normalizePhone(nextCustomer.phone)));
  next.unshift(nextCustomer);
  return sortCustomers(next);
}

function getCustomerKey(brandId: string | null, phone: string) {
  return `${brandId ?? 'no-brand'}:${normalizePhone(phone)}`;
}

function mapCustomerRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    brand_id: row.brand_id,
    name: row.name,
    phone: row.phone,
    phone_secondary: row.phone_secondary ?? '',
    address: row.address ?? '',
    address_house_number: row.address_house_number ?? '',
    address_street: row.address_street ?? '',
    address_area: row.address_area ?? '',
    address_floor: row.address_floor ?? '',
    address_apartment: row.address_apartment ?? '',
    notes: row.notes ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at ?? row.created_at,
    last_order_at: row.updated_at ?? row.created_at,
    order_count: row.order_count ?? 0,
    record_source: 'customers',
  };
}

function buildCustomersFromOrders(rows: OrderCustomerAnalyticsRow[]): Customer[] {
  const customersByKey = new Map<string, Customer>();

  for (const row of rows) {
    const phone = compactWhitespace(row.phone ?? '');
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      continue;
    }

    const metadata = extractLegacyOrderMetadata(row.notes);
    const addressParts = parseDetailedAddress(row.address ?? '');
    const key = getCustomerKey(row.brand_id, phone);
    const current = customersByKey.get(key);
    const nextTimestamp = row.created_at ?? new Date().toISOString();

    const nextCustomer: Customer = {
      id: current?.id ?? row.id,
      brand_id: row.brand_id,
      name: compactWhitespace(row.customer_name ?? current?.name ?? ''),
      phone,
      phone_secondary: metadata.phoneSecondary || current?.phone_secondary || '',
      address: compactWhitespace(row.address ?? current?.address ?? ''),
      address_house_number: addressParts.address_house_number || current?.address_house_number || '',
      address_street: addressParts.address_street || current?.address_street || '',
      address_area: addressParts.address_area || current?.address_area || '',
      address_floor: addressParts.address_floor || current?.address_floor || '',
      address_apartment: addressParts.address_apartment || current?.address_apartment || '',
      notes: metadata.notes || current?.notes || '',
      created_at: current?.created_at ?? nextTimestamp,
      updated_at: nextTimestamp,
      last_order_at: nextTimestamp,
      order_count: (current?.order_count ?? 0) + 1,
      record_source: 'orders',
    };

    customersByKey.set(key, nextCustomer);
  }

  return sortCustomers(Array.from(customersByKey.values()));
}

function mergeCustomersWithAnalytics(customerRows: CustomerRow[], orderRows: OrderCustomerAnalyticsRow[]) {
  const orderDerivedCustomers = buildCustomersFromOrders(orderRows);
  const orderAnalyticsByKey = new Map(orderDerivedCustomers.map(customer => [getCustomerKey(customer.brand_id, customer.phone), customer]));
  const mergedByKey = new Map<string, Customer>();

  for (const row of customerRows) {
    const mappedCustomer = mapCustomerRow(row);
    const key = getCustomerKey(mappedCustomer.brand_id, mappedCustomer.phone);
    const analyticsCustomer = orderAnalyticsByKey.get(key);

    mergedByKey.set(key, {
      ...mappedCustomer,
      address: mappedCustomer.address || analyticsCustomer?.address || '',
      address_house_number: mappedCustomer.address_house_number || analyticsCustomer?.address_house_number || '',
      address_street: mappedCustomer.address_street || analyticsCustomer?.address_street || '',
      address_area: mappedCustomer.address_area || analyticsCustomer?.address_area || '',
      address_floor: mappedCustomer.address_floor || analyticsCustomer?.address_floor || '',
      address_apartment: mappedCustomer.address_apartment || analyticsCustomer?.address_apartment || '',
      phone_secondary: mappedCustomer.phone_secondary || analyticsCustomer?.phone_secondary || '',
      notes: mappedCustomer.notes || analyticsCustomer?.notes || '',
      order_count: analyticsCustomer?.order_count ?? mappedCustomer.order_count,
      last_order_at: analyticsCustomer?.last_order_at ?? mappedCustomer.last_order_at,
      updated_at: analyticsCustomer?.last_order_at ?? mappedCustomer.updated_at,
    });
  }

  for (const customer of orderDerivedCustomers) {
    const key = getCustomerKey(customer.brand_id, customer.phone);
    if (!mergedByKey.has(key)) {
      mergedByKey.set(key, customer);
    }
  }

  return sortCustomers(Array.from(mergedByKey.values()));
}

function buildCustomersFromLocalOrders() {
  return buildCustomersFromOrders(getLocalDemoOrders().map((order) => ({
    id: order.id,
    brand_id: order.brand_id,
    customer_name: order.customer_name,
    phone: order.phone,
    address: order.address,
    notes: order.notes,
    created_at: order.created_at,
  })));
}

export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [storageMode, setStorageMode] = useState<CustomerStorageMode>('orders');

  const loadFromOrders = useCallback(async () => {
    if (isSupabaseUnavailable()) {
      setStorageMode('orders');
      setCustomers(buildCustomersFromLocalOrders());
      return;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('id, brand_id, customer_name, phone, address, notes, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        setStorageMode('orders');
        setCustomers(buildCustomersFromLocalOrders());
        return;
      }

      toast.error('فشل تحميل بيانات العملاء');
      console.error(error);
      setCustomers([]);
      return;
    }

    markSupabaseAvailable();
    setStorageMode('orders');
    setCustomers(buildCustomersFromOrders(data ?? []));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);

    if (isSupabaseUnavailable()) {
      setStorageMode('orders');
      setCustomers(buildCustomersFromLocalOrders());
      setLoading(false);
      return;
    }

    const [{ data: customerRows, error: customerError }, { data: orderRows, error: orderError }] = await Promise.all([
      supabase
        .from('customers')
        .select('*')
        .order('updated_at', { ascending: false }),
      supabase
        .from('orders')
        .select('id, brand_id, customer_name, phone, address, notes, created_at')
        .order('created_at', { ascending: false }),
    ]);

    if (orderError) {
      if (isSupabaseNetworkError(orderError)) {
        markSupabaseUnavailable();
        setStorageMode('orders');
        setCustomers(buildCustomersFromLocalOrders());
        setLoading(false);
        return;
      }

      toast.error('فشل تحميل تحليلات العملاء');
      console.error(orderError);
      setLoading(false);
      return;
    }

    if (customerError) {
      if (isSupabaseNetworkError(customerError)) {
        markSupabaseUnavailable();
        setStorageMode('orders');
        setCustomers(buildCustomersFromLocalOrders());
      } else if (isMissingCustomersTableError(customerError.message)) {
        await loadFromOrders();
      } else {
        toast.error('فشل تحميل بيانات العملاء');
        console.error(customerError);
      }
    } else {
      markSupabaseAvailable();
      setStorageMode('customers');
      setCustomers(mergeCustomersWithAnalytics(customerRows ?? [], orderRows ?? []));
    }

    setLoading(false);
  }, [loadFromOrders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useSupabaseReconnect(() => {
    void refresh();
  });

  useSupabaseRealtimeRefresh({
    channelName: 'customers-realtime',
    tables: [{ table: 'customers' }, { table: 'orders' }],
    onRefresh: refresh,
  });

  const upsertCustomer = async (input: CustomerUpsertInput) => {
    const phone = normalizePhone(input.phone);
    const phoneSecondary = normalizePhone(input.phone_secondary);
    const timestamp = new Date().toISOString();
    const optimisticCustomer: Customer = {
      id: input.id ?? `local-${input.brand_id}-${phone}`,
      brand_id: input.brand_id,
      name: compactWhitespace(input.name),
      phone,
      phone_secondary: phoneSecondary,
      address: compactWhitespace(input.address),
      address_house_number: compactWhitespace(input.address_house_number),
      address_street: compactWhitespace(input.address_street),
      address_area: compactWhitespace(input.address_area),
      address_floor: compactWhitespace(input.address_floor),
      address_apartment: compactWhitespace(input.address_apartment),
      notes: compactWhitespace(input.notes),
      created_at: timestamp,
      updated_at: timestamp,
      last_order_at: timestamp,
      order_count: 0,
      record_source: storageMode,
    };

    if (storageMode === 'orders') {
      return optimisticCustomer;
    }

    setCustomers(current => mergeCustomer(current, optimisticCustomer));

    const { data, error } = await supabase
      .from('customers')
      .upsert({
        id: input.id,
        brand_id: input.brand_id,
        name: compactWhitespace(input.name),
        phone,
        phone_secondary: phoneSecondary,
        address: compactWhitespace(input.address),
        address_house_number: compactWhitespace(input.address_house_number),
        address_street: compactWhitespace(input.address_street),
        address_area: compactWhitespace(input.address_area),
        address_floor: compactWhitespace(input.address_floor),
        address_apartment: compactWhitespace(input.address_apartment),
        notes: compactWhitespace(input.notes),
      }, { onConflict: 'brand_id,phone' })
      .select('*')
      .single();

    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        setStorageMode('orders');
        return optimisticCustomer;
      }

      if (isMissingCustomersTableError(error.message)) {
        setStorageMode('orders');
        return optimisticCustomer;
      }

      toast.error('تعذر حفظ بيانات العميل');
      console.error(error);
      return null;
    }

    markSupabaseAvailable();

    const nextCustomer = mapCustomerRow(data);
    setCustomers(current => mergeCustomer(current, nextCustomer));
    return nextCustomer;
  };

  return { customers, loading, storageMode, refresh, upsertCustomer };
}