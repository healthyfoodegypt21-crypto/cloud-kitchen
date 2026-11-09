import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrationssupabase/types';
import { getSupabaseOfflineReason, isSupabaseNetworkError, isSupabaseUnavailable, markSupabaseAvailable, markSupabaseUnavailable } from '@/integrationssupabase/runtime';
import { useSupabaseReconnect } from '@/hooks/useSupabaseReconnect';
import { Brand } from '@/hooks/useBrands';
import { buildDemoOrders, clearLocalDemoOrders, DEMO_ORDER_NUMBER_PREFIX, getLocalDemoOrders, markDemoOrdersInitialized, materializeDemoOrders, saveLocalDemoOrders } from '@/lib/demoOrders';
import { getRecoveredSheetMealsForPhone } from '@/lib/orderMeals';
import { Order, OrderStatus, OrderSource, MealType, OrderMode } from '@/types/order';
import { toast } from 'sonner';
import { buildOrderNotesWithMetadata, compactWhitespace, extractLegacyOrderMetadata, formatDetailedAddress, hasDetailedAddressParts, normalizePhone } from '@/lib/utils';
import { getOrderImportFingerprint, hasDuplicateOrderImport, ImportedOrder } from '@/lib/orderImport';
import { asSupabaseLooseClient } from '@/lib/supabaseLoose';

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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuidOrNull = (value: string | null | undefined) => (value && UUID_PATTERN.test(value) ? value : null);

function buildOrderPersistencePayload(order: Omit<Order, 'id' | 'created_at'>) {
  const address = hasDetailedAddressParts(order)
    ? formatDetailedAddress(order)
    : compactWhitespace(order.address);
  const notes = buildOrderNotesWithMetadata({
    notes: order.notes,
    phoneSecondary: order.phone_secondary,
    executionDate: order.execution_date,
    locationLink: order.location_link,
    mealCustomizations: order.meal_customizations,
    packageMealSnapshot: order.package_meal_snapshot,
    customerAmount: order.customer_amount,
    deliveryFee: order.delivery_fee,
    importedMealDetails: order.imported_meal_details,
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
    package_plan_id: asUuidOrNull(order.package_plan_id),
    meal_type: order.meal_type,
    order_mode: order.order_mode,
    notes,
    status: order.status,
    price: order.price,
    execution_date: order.execution_date,
    phone_secondary: order.phone_secondary,
    selected_meal_ids: order.selected_meal_ids,
    source: order.source,
    brand_id: asUuidOrNull(order.brand_id),
    created_by: asUuidOrNull(order.created_by),
    assigned_to: asUuidOrNull(order.assigned_to),
  };
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
      const mappedOrders = ((data ?? []) as OrderRow[]).map(d => {
        const legacy = extractLegacyOrderMetadata(d.notes);
        const recoveredMeals = getRecoveredSheetMealsForPhone(d.phone);
        const hasRealImportedMeals = (legacy.importedMealDetails ?? []).some(
          item => !/^(?:weekly|week|monthly|daily|وجبات من المنيو|باكدج.*|باقة.*|package.*)$/iu.test(item.trim()),
        );
        const importedMealDetails = hasRealImportedMeals
          ? legacy.importedMealDetails
          : (recoveredMeals ?? legacy.importedMealDetails);

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
          customer_amount: legacy.customerAmount ?? Number(d.price),
          delivery_fee: legacy.deliveryFee ?? 0,
          imported_meal_details: importedMealDetails,
          status: d.status as OrderStatus,
          created_at: d.created_at,
          price: Number(d.price),
          selected_meal_ids: d.selected_meal_ids ?? [],
          source: d.source as OrderSource,
          brand_id: d.brand_id,
          created_by: d.created_by,
        };
      });

      const seenImportedOrderKeys = new Set<string>();
      const redundantOrderIds: string[] = [];
      const nextOrders = mappedOrders.filter(order => {
        if (/^(?:الاسم|اسم)\s*\d+$/u.test(order.customer_name.trim())) {
          redundantOrderIds.push(order.id);
          return false;
        }

        if (order.order_number.startsWith('IMP-')) {
          const dedupeKey = `${order.brand_id ?? ''}::${order.execution_date}::${normalizePhone(order.phone)}`;
          if (seenImportedOrderKeys.has(dedupeKey)) {
            redundantOrderIds.push(order.id);
            return false;
          }
          seenImportedOrderKeys.add(dedupeKey);
        }

        return true;
      });

      if (redundantOrderIds.length > 0) {
        void supabase.from('orders').delete().in('id', redundantOrderIds);
      }

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
    const legacyOrder = buildOrderPersistencePayload(order);
    const address = legacyOrder.address;
    const noteParts = legacyOrder.notes;

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

    const { error } = await asSupabaseLooseClient(supabase).from('orders').insert(legacyOrder);
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

  const saveImportedOrder = async (order: ImportedOrder): Promise<'imported' | 'duplicate' | 'failed'> => {
    const fingerprint = getOrderImportFingerprint(order);
    const localOrders = getLocalDemoOrders();
    if (localOrders.some(existing => existing.order_number === order.order_number || getOrderImportFingerprint(existing) === fingerprint)) {
      return 'duplicate';
    }

    if (isSupabaseUnavailable()) {
      return await addOrder(order) ? 'imported' : 'failed';
    }

    const existingResponse = await supabase
      .from('orders')
      .select('id, order_number, customer_name, phone, phone_secondary, address, execution_date, order_mode, package, package_plan_id, meal_type, notes, price, selected_meal_ids, brand_id')
      .eq('brand_id', order.brand_id)
      .eq('phone', order.phone)
      .eq('execution_date', order.execution_date);

    if (existingResponse.error) {
      if (isSupabaseNetworkError(existingResponse.error)) {
        markSupabaseUnavailable();
        return await addOrder(order) ? 'imported' : 'failed';
      }

      toast.error('تعذر التحقق من الطلبات السابقة؛ لم يتم استيراد هذا الطلب لتجنب التكرار.');
      console.error(existingResponse.error);
      return 'failed';
    }

    const existingRows = existingResponse.data ?? [];
    if (hasDuplicateOrderImport(order, existingRows)) {
      markSupabaseAvailable();
      return 'duplicate';
    }

    const payload = buildOrderPersistencePayload(order);

    if (existingRows.length > 0 && typeof (existingRows[0] as { id?: string }).id === 'string') {
      const [primaryRow, ...duplicateRows] = existingRows as Array<{ id: string }>;
      const { error: updateError } = await asSupabaseLooseClient(supabase).from('orders').update(payload).eq('id', primaryRow.id);
      if (updateError) {
        toast.error(updateError.message);
        return 'failed';
      }
      if (duplicateRows.length > 0) {
        void supabase.from('orders').delete().in('id', duplicateRows.map(row => row.id));
      }
      markSupabaseAvailable();
      return 'imported';
    }

    const { error } = await asSupabaseLooseClient(supabase).from('orders').insert(payload);

    if (error) {
      if (error.code === '23505') return 'duplicate';
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        return await addOrder(order) ? 'imported' : 'failed';
      }

      toast.error(error.message);
      return 'failed';
    }

    markSupabaseAvailable();
    return 'imported';
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

    const { error } = await asSupabaseLooseClient(supabase).from('orders').update({ status }).eq('id', id);
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

  const updateOrder = async (id: string, order: Omit<Order, 'id' | 'created_at'>) => {
    const legacyOrder = buildOrderPersistencePayload(order);

    const localDemoOrders = getLocalDemoOrders();
    const localDemoOrderExists = localDemoOrders.some((existing) => existing.id === id);
    if (localDemoOrderExists) {
      const nextLocalOrders = localDemoOrders.map((existing) => existing.id === id
        ? { ...order, id, created_at: existing.created_at, address: legacyOrder.address, notes: legacyOrder.notes }
        : existing);
      saveLocalDemoOrders(nextLocalOrders);
      syncLocalOrders(localDemoOrders, nextLocalOrders);
      toast.success('تم تحديث الطلب');
      return true;
    }

    if (isSupabaseUnavailable()) {
      toast.error('الاتصال بقاعدة البيانات غير متاح؛ لم يتم تحديث الطلب.');
      return false;
    }

    const { error } = await asSupabaseLooseClient(supabase).from('orders').update(legacyOrder).eq('id', id);
    if (error) {
      if (isSupabaseNetworkError(error)) {
        markSupabaseUnavailable();
        toast.error('الاتصال بقاعدة البيانات غير متاح؛ لم يتم تحديث الطلب.');
        return false;
      }
      toast.error(error.message);
      return false;
    }

    markSupabaseAvailable();
    toast.success('تم تحديث الطلب');
    return true;
  };

  const updateOrdersStatus = async (ids: string[], status: OrderStatus) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) return true;

    const localOrders = getLocalDemoOrders();
    const localOrderIds = new Set(localOrders.map(order => order.id));
    const localIds = uniqueIds.filter(id => localOrderIds.has(id));
    const databaseIds = uniqueIds.filter(id => !localOrderIds.has(id));
    let updatedDatabaseIds: string[] = [];

    if (databaseIds.length > 0) {
      if (isSupabaseUnavailable()) {
        toast.error('الاتصال بقاعدة البيانات غير متاح؛ لم يتم تأكيد الطلبات المحفوظة على الخادم.');
        return false;
      }

      const { data, error } = await asSupabaseLooseClient(supabase)
        .from('orders')
        .update({ status })
        .in('id', databaseIds)
        .eq('status', 'new')
        .select('id');

      if (error) {
        if (isSupabaseNetworkError(error)) markSupabaseUnavailable();
        else toast.error(error.message);
        return false;
      }

      updatedDatabaseIds = (Array.isArray(data) ? data : []).map((order) => String((order as { id?: unknown }).id ?? '')).filter(Boolean);
      markSupabaseAvailable();
    }

    const nextLocalOrders = localOrders.map(order => (
      localIds.includes(order.id) && order.status === 'new'
        ? { ...order, status }
        : order
    ));
    if (nextLocalOrders.some((order, index) => order.status !== localOrders[index]?.status)) {
      saveLocalDemoOrders(nextLocalOrders);
      syncLocalOrders(localOrders, nextLocalOrders);
    }

    if (updatedDatabaseIds.length !== databaseIds.length) {
      toast.error('تغيرت حالة بعض الطلبات أثناء التأكيد. حدّث القائمة وراجع الطلبات المتبقية.');
      return false;
    }

    return true;
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
      const insertPayload = demoOrders.map((order) => buildOrderPersistencePayload(order));

      const insertResponse = await asSupabaseLooseClient(supabase).from('orders').insert(insertPayload);
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

  return { orders, loading, addOrder, saveImportedOrder, updateOrder, updateStatus, updateOrdersStatus, refresh: fetchOrders, seedDemoOrders };
}
