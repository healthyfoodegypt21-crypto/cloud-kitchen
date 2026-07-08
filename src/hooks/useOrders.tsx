import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrationssupabase/types';
import { getSupabaseOfflineReason, isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { Brand } from '@/hooks/useBrands';
import { buildDemoOrders, clearLocalDemoOrders, DEMO_ORDER_NUMBER_PREFIX, getLocalDemoOrders, markDemoOrdersInitialized, materializeDemoOrders, saveLocalDemoOrders } from '@/lib/demoOrders';
import { Order, OrderStatus, OrderSource, MealType, OrderMode } from '@/types/order';
import { toast } from 'sonner';
import { buildOrderNotesWithMetadata, compactWhitespace, extractLegacyOrderMetadata, formatDetailedAddress, hasDetailedAddressParts } from '@/lib/utils';

type OrderRow = Database['public']['Tables']['orders']['Row'] & {
  phone_secondary: string;
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
  execution_date: string;
};

function sortOrders(list: Order[]) {
  return [...list].sort((left, right) => {
    const leftExecutionTime = left.execution_date ? new Date(left.execution_date).getTime() : Number.POSITIVE_INFINITY;
    const rightExecutionTime = right.execution_date ? new Date(right.execution_date).getTime() : Number.POSITIVE_INFINITY;

    if (leftExecutionTime !== rightExecutionTime) {
      return leftExecutionTime - rightExecutionTime;
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function mergeOrdersWithLocalDemoOrders(databaseOrders: Order[], localDemoOrders: Order[]) {
  const databaseOrderNumbers = new Set(databaseOrders.map((order) => order.order_number));
  return sortOrders([
    ...databaseOrders,
    ...localDemoOrders.filter((order) => !databaseOrderNumbers.has(order.order_number)),
  ]);
}

function generateLocalOrderId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `local-order-${crypto.randomUUID()}`;
  }

  return `local-order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const syncLocalOrders = useCallback((previousLocalOrders: Order[], nextLocalOrders: Order[]) => {
    const previousLocalOrderIds = new Set(previousLocalOrders.map((order) => order.id));
    setOrders((current) => mergeOrdersWithLocalDemoOrders(
      current.filter((order) => !previousLocalOrderIds.has(order.id)),
      nextLocalOrders,
    ));
  }, []);

  const fetchOrders = useCallback(async () => {
    if (isSupabaseUnavailable()) {
      setOrders(sortOrders(getLocalDemoOrders()));
      setLoading(false);
      return false;
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
      } else {
        toast.error('فشل تحميل الطلبات');
      }

      console.error(error);
      setOrders(sortOrders(getLocalDemoOrders()));
    } else {
      markSupabaseAvailable();
      const nextOrders = ((data ?? []) as OrderRow[]).map(d => {
        const legacy = extractLegacyOrderMetadata(d.notes);

        return {
          id: d.id,
          order_number: d.order_number,
          customer_name: d.customer_name,
          phone: d.phone,
          phone_secondary: d.phone_secondary ?? legacy.phoneSecondary,
          location_link: legacy.locationLink,
          address: d.address,
          address_house_number: d.address_house_number ?? '',
          address_street: d.address_street ?? '',
          address_area: d.address_area ?? '',
          address_floor: d.address_floor ?? '',
          address_apartment: d.address_apartment ?? '',
          execution_date: d.execution_date ?? legacy.executionDate,
          order_mode: d.order_mode as OrderMode,
          package: d.package,
          package_plan_id: d.package_plan_id,
          meal_type: d.meal_type as MealType,
          notes: legacy.notes,
          meal_customizations: legacy.mealCustomizations,
          package_meal_snapshot: legacy.packageMealSnapshot,
          status: d.status as OrderStatus,
          created_at: d.created_at,
          price: Number(d.price),
          selected_meal_ids: d.selected_meal_ids ?? [],
          source: d.source as OrderSource,
          brand_id: d.brand_id,
          created_by: d.created_by,
        };
      });

      setOrders(mergeOrdersWithLocalDemoOrders(nextOrders, getLocalDemoOrders()));
    }
    setLoading(false);
    return !error;
  }, []);

  useEffect(() => {
    let isActive = true;
    let channel: Parameters<typeof supabase.removeChannel>[0] | null = null;

    void fetchOrders().then((canSubscribe) => {
      if (!isActive || !canSubscribe || isSupabaseUnavailable()) {
        return;
      }

      channel = supabase
        .channel('orders-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          void fetchOrders();
        })
        .subscribe();
    });

    return () => {
      isActive = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [fetchOrders]);

  useSupabaseReconnect(() => {
    void fetchOrders();
  });

  const addOrder = async (order: Omit<Order, 'id' | 'created_at'>) => {
    const address = hasDetailedAddressParts(order)
      ? formatDetailedAddress(order)
      : compactWhitespace(order.address);
    const noteParts = buildOrderNotesWithMetadata({
      notes: order.notes,
      phoneSecondary: order.phone_secondary,
      executionDate: order.execution_date,
      locationLink: order.location_link,
      mealCustomizations: order.meal_customizations,
      packageMealSnapshot: order.package_meal_snapshot,
    });

    const legacyOrder = {
      order_number: order.order_number,
      customer_name: order.customer_name,
      phone: order.phone,
      address,
      address_house_number: order.address_house_number,
      address_street: order.address_street,
      address_area: order.address_area,
      address_floor: order.address_floor,
      address_apartment: order.address_apartment,
      package: order.package,
      package_plan_id: order.package_plan_id,
      meal_type: order.meal_type,
      order_mode: order.order_mode,
      notes: noteParts,
      status: order.status,
      price: order.price,
      execution_date: order.execution_date,
      phone_secondary: order.phone_secondary,
      selected_meal_ids: order.selected_meal_ids,
      source: order.source,
      brand_id: order.brand_id,
      created_by: order.created_by,
    };

    if (isSupabaseUnavailable()) {
      const previousLocalOrders = getLocalDemoOrders();
      const nextLocalOrders = sortOrders([
        ...previousLocalOrders,
        {
          ...order,
          id: generateLocalOrderId(),
          address,
          notes: noteParts,
          created_at: new Date().toISOString(),
        },
      ]);
      saveLocalDemoOrders(nextLocalOrders);
      syncLocalOrders(previousLocalOrders, nextLocalOrders);
      toast.success(getSupabaseOfflineReason('الطلبات'));
      return true;
    }

    const { error } = await supabase.from('orders').insert(legacyOrder);
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        const previousLocalOrders = getLocalDemoOrders();
        const nextLocalOrders = sortOrders([
          ...previousLocalOrders,
          {
            ...order,
            id: generateLocalOrderId(),
            address,
            notes: noteParts,
            created_at: new Date().toISOString(),
          },
        ]);
        saveLocalDemoOrders(nextLocalOrders);
        syncLocalOrders(previousLocalOrders, nextLocalOrders);
        toast.success(getSupabaseOfflineReason('الطلبات'));
        return true;
      }

      toast.error(error.message);
      return false;
    }

    markSupabaseAvailable();
    return true;
  };

  const updateStatus = async (id: string, status: OrderStatus) => {
    const localDemoOrders = getLocalDemoOrders();
    const localDemoOrderExists = localDemoOrders.some((order) => order.id === id);

    if (localDemoOrderExists) {
      const nextLocalOrders = localDemoOrders.map((order) => order.id === id ? { ...order, status } : order);
      saveLocalDemoOrders(nextLocalOrders);
      syncLocalOrders(localDemoOrders, nextLocalOrders);
      return;
    }

    if (isSupabaseUnavailable()) {
      return;
    }

    const { error } = await supabase.from('orders').update({ status }).eq('id', id);
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        return;
      }

      toast.error(error.message);
      return;
    }

    markSupabaseAvailable();
  };

  const seedDemoOrders = async (brands: Brand[], options?: { silent?: boolean }) => {
    const demoOrders = buildDemoOrders(brands);
    if (demoOrders.length === 0) {
      if (!options?.silent) {
        toast.error('تعذر تجهيز الأوردرات التجريبية. تأكد من وجود البراندات المطلوبة.');
      }
      return false;
    }

    if (isSupabaseUnavailable()) {
      const localDemoOrders = materializeDemoOrders(brands);
      saveLocalDemoOrders(localDemoOrders);
      markDemoOrdersInitialized();
      await fetchOrders();
      if (!options?.silent) {
        toast.success('تم إنشاء 10 أوردرات تجريبية محليًا لأيام 21 و22 و23 مارس');
      }
      return true;
    }

    const deleteResponse = await supabase.from('orders').delete().like('order_number', `${DEMO_ORDER_NUMBER_PREFIX}%`);
    if (!deleteResponse.error) {
      const insertPayload = demoOrders.map((order) => {
        const address = hasDetailedAddressParts(order)
          ? formatDetailedAddress(order)
          : compactWhitespace(order.address);
        const noteParts = buildOrderNotesWithMetadata({
          notes: order.notes,
          phoneSecondary: order.phone_secondary,
          executionDate: order.execution_date,
          locationLink: order.location_link,
          mealCustomizations: order.meal_customizations,
          packageMealSnapshot: order.package_meal_snapshot,
        });

        return {
          order_number: order.order_number,
          customer_name: order.customer_name,
          phone: order.phone,
          address,
          address_house_number: order.address_house_number,
          address_street: order.address_street,
          address_area: order.address_area,
          address_floor: order.address_floor,
          address_apartment: order.address_apartment,
          package: order.package,
          package_plan_id: order.package_plan_id,
          meal_type: order.meal_type,
          order_mode: order.order_mode,
          notes: noteParts,
          status: order.status,
          price: order.price,
          execution_date: order.execution_date,
          phone_secondary: order.phone_secondary,
          selected_meal_ids: order.selected_meal_ids,
          source: order.source,
          brand_id: order.brand_id,
          created_by: order.created_by,
        };
      });

      const insertResponse = await supabase.from('orders').insert(insertPayload);
      if (!insertResponse.error) {
        markSupabaseAvailable();
        clearLocalDemoOrders();
        markDemoOrdersInitialized();
        if (!options?.silent) {
          toast.success('تم إنشاء 10 أوردرات تجريبية لأيام 21 و22 و23 مارس');
        }
        await fetchOrders();
        return true;
      }

      console.error(insertResponse.error);
    } else {
      if (isSupabaseNetworkError(deleteResponse.error)) {
        markSupabaseUnavailable();
      }
      console.error(deleteResponse.error);
    }

    const localDemoOrders = materializeDemoOrders(brands);
    saveLocalDemoOrders(localDemoOrders);
    markDemoOrdersInitialized();
    await fetchOrders();
    if (!options?.silent) {
      toast.success('تم إنشاء 10 أوردرات تجريبية محليًا لأيام 21 و22 و23 مارس');
    }
    return true;
  };

  return { orders, loading, addOrder, updateStatus, refresh: fetchOrders, seedDemoOrders };
}
