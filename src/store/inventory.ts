import { compactWhitespace } from '@/lib/utils';
import { InventoryBatch, InventoryBatchStatus, InventoryCategory, InventoryCount, InventoryCountInput, InventoryItem, InventoryItemInput, InventoryMovement, InventoryMovementInput, InventoryReorderSuggestion, InventoryStatus, InventoryTransfer, InventoryTransferInput, InventoryTransferItem, InventoryTransferItemInput } from '@/types/inventory';

const INVENTORY_STORAGE_KEY = 'cloud-kitchen.inventory';

type DemoInventorySeed = Omit<InventoryItemInput, 'brand_id'>;
type InventoryMovementSeed = Omit<InventoryMovement, 'id' | 'created_at' | 'updated_at'>;
type InventoryBatchSeed = Omit<InventoryBatch, 'id' | 'created_at' | 'updated_at'>;
type InventoryCountSeed = Omit<InventoryCount, 'id' | 'created_at' | 'updated_at'>;
type InventoryTransferSeed = Omit<InventoryTransfer, 'id' | 'created_at' | 'updated_at'>;
type InventoryTransferItemSeed = Omit<InventoryTransferItem, 'id' | 'created_at' | 'updated_at'>;

const INVENTORY_MOVEMENTS_STORAGE_KEY = 'cloud-kitchen.inventory.movements';
const INVENTORY_BATCHES_STORAGE_KEY = 'cloud-kitchen.inventory.batches';
const INVENTORY_COUNTS_STORAGE_KEY = 'cloud-kitchen.inventory.counts';
const INVENTORY_TRANSFERS_STORAGE_KEY = 'cloud-kitchen.inventory.transfers';
const INVENTORY_TRANSFER_ITEMS_STORAGE_KEY = 'cloud-kitchen.inventory.transfer-items';

const DEMO_INVENTORY_SEED: DemoInventorySeed[] = [
  {
    name: 'صدور دجاج',
    english_name: 'Chicken Breast',
    sku: 'CHK-BRST',
    barcode: '100000000001',
    category: 'protein',
    subcategory: 'poultry',
    base_unit: 'kg',
    purchase_unit: 'kg',
    issue_unit: 'g',
    conversion_factor: 1000,
    unit: 'kg',
    quantity: 18,
    reorder_point: 10,
    cost_per_unit: 165,
    last_purchase_price: 162,
    avg_cost: 164,
    min_purchase_price: 155,
    max_purchase_price: 170,
    sale_price: 0,
    min_stock: 10,
    max_stock: 40,
    shelf_life_days: 5,
    lead_time_days: 2,
    supplier_name: 'مزارع النقاء',
    alternate_supplier_name: 'الشروق للدواجن',
    storage_location: 'فريزر 1',
    warehouse_location: 'مخزن التبريد',
    notes: 'مخصص لوجبات الغداء والباقات.',
    is_active: true,
  },
  {
    name: 'أرز بسمتي',
    english_name: 'Basmati Rice',
    sku: 'RICE-BSM',
    barcode: '100000000002',
    category: 'carbohydrate',
    subcategory: 'rice',
    base_unit: 'kg',
    purchase_unit: 'kg',
    issue_unit: 'g',
    conversion_factor: 1000,
    unit: 'kg',
    quantity: 7,
    reorder_point: 12,
    cost_per_unit: 58,
    last_purchase_price: 57,
    avg_cost: 56,
    min_purchase_price: 53,
    max_purchase_price: 61,
    sale_price: 0,
    min_stock: 12,
    max_stock: 60,
    shelf_life_days: 365,
    lead_time_days: 3,
    supplier_name: 'شركة الحبوب الحديثة',
    alternate_supplier_name: 'أرض النيل',
    storage_location: 'مخزن جاف A',
    warehouse_location: 'مخزن جاف',
    notes: 'وصل إلى حد إعادة الطلب.',
    is_active: true,
  },
  {
    name: 'خضار مشكلة',
    english_name: 'Mixed Vegetables',
    sku: 'VEG-MIX',
    barcode: '100000000003',
    category: 'vegetable',
    subcategory: 'mixed',
    base_unit: 'kg',
    purchase_unit: 'kg',
    issue_unit: 'g',
    conversion_factor: 1000,
    unit: 'kg',
    quantity: 4,
    reorder_point: 6,
    cost_per_unit: 36,
    last_purchase_price: 35,
    avg_cost: 34,
    min_purchase_price: 31,
    max_purchase_price: 38,
    min_stock: 6,
    max_stock: 25,
    shelf_life_days: 4,
    lead_time_days: 1,
    supplier_name: 'سوق الخضار المركزي',
    alternate_supplier_name: 'الخضار الطازج',
    storage_location: 'مخزن التبريد',
    warehouse_location: 'مخزن التبريد',
    notes: 'يستخدم في السلطات والميكس.',
    is_active: true,
  },
  {
    name: 'علب تغليف 750 مل',
    english_name: '750 ml Container',
    sku: 'PKG-750',
    barcode: '100000000004',
    category: 'packaging',
    subcategory: 'containers',
    base_unit: 'box',
    purchase_unit: 'carton',
    issue_unit: 'box',
    conversion_factor: 50,
    unit: 'box',
    quantity: 1,
    reorder_point: 3,
    cost_per_unit: 420,
    last_purchase_price: 415,
    avg_cost: 418,
    min_purchase_price: 395,
    max_purchase_price: 430,
    min_stock: 3,
    max_stock: 20,
    shelf_life_days: null,
    lead_time_days: 4,
    supplier_name: 'باك برو',
    alternate_supplier_name: 'تغليف العرب',
    storage_location: 'مخزن التغليف',
    warehouse_location: 'مخزن التغليف',
    notes: 'متبقي كرتونة واحدة فقط.',
    is_active: true,
  },
  {
    name: 'صوص ثاوزند آيلاند',
    english_name: 'Thousand Island Sauce',
    sku: 'SCE-1000',
    barcode: '100000000005',
    category: 'sauce',
    subcategory: 'cold sauces',
    base_unit: 'l',
    purchase_unit: 'l',
    issue_unit: 'ml',
    conversion_factor: 1000,
    unit: 'l',
    quantity: 0,
    reorder_point: 2,
    cost_per_unit: 95,
    last_purchase_price: 93,
    avg_cost: 94,
    min_purchase_price: 90,
    max_purchase_price: 98,
    min_stock: 2,
    max_stock: 8,
    shelf_life_days: 30,
    lead_time_days: 2,
    supplier_name: 'فاين فودز',
    alternate_supplier_name: 'الذواق',
    storage_location: 'مخزن التبريد',
    warehouse_location: 'مخزن التبريد',
    notes: 'نفد ويحتاج شراء فوري.',
    is_active: true,
  },
  {
    name: 'لبن',
    english_name: 'Milk',
    sku: 'DAIRY-MILK',
    barcode: '100000000006',
    category: 'dairy',
    subcategory: 'milk',
    base_unit: 'l',
    purchase_unit: 'carton',
    issue_unit: 'ml',
    conversion_factor: 1000,
    unit: 'l',
    quantity: 12,
    reorder_point: 8,
    cost_per_unit: 28,
    last_purchase_price: 27,
    avg_cost: 26,
    min_purchase_price: 24,
    max_purchase_price: 30,
    min_stock: 8,
    max_stock: 24,
    shelf_life_days: 7,
    lead_time_days: 2,
    supplier_name: 'ألبان النخبة',
    alternate_supplier_name: 'المذاق الذهبي',
    storage_location: 'مخزن التبريد',
    warehouse_location: 'مخزن التبريد',
    notes: 'للقهوة والمنتجات الجاهزة.',
    is_active: true,
  },
  {
    name: 'فلفل أحمر',
    english_name: 'Paprika',
    sku: 'SPC-PAP',
    barcode: '100000000007',
    category: 'spices',
    subcategory: 'seasoning',
    base_unit: 'kg',
    purchase_unit: 'kg',
    issue_unit: 'g',
    conversion_factor: 1000,
    unit: 'kg',
    quantity: 1.5,
    reorder_point: 2,
    cost_per_unit: 210,
    last_purchase_price: 205,
    avg_cost: 200,
    min_purchase_price: 190,
    max_purchase_price: 220,
    min_stock: 2,
    max_stock: 8,
    shelf_life_days: 180,
    lead_time_days: 3,
    supplier_name: 'بهارات الشرق',
    alternate_supplier_name: 'نكهة الشام',
    storage_location: 'مخزن جاف A',
    warehouse_location: 'مخزن جاف',
    notes: 'مهم للتتبيلات والصلصات.',
    is_active: true,
  },
  {
    name: 'زيت زيتون',
    english_name: 'Olive Oil',
    sku: 'OIL-OLV',
    barcode: '100000000008',
    category: 'oils',
    subcategory: 'cooking oil',
    base_unit: 'l',
    purchase_unit: 'l',
    issue_unit: 'ml',
    conversion_factor: 1000,
    unit: 'l',
    quantity: 10,
    reorder_point: 8,
    cost_per_unit: 165,
    last_purchase_price: 160,
    avg_cost: 158,
    min_purchase_price: 155,
    max_purchase_price: 172,
    min_stock: 8,
    max_stock: 25,
    shelf_life_days: 365,
    lead_time_days: 5,
    supplier_name: 'زيتون مصر',
    alternate_supplier_name: 'الريف الأخضر',
    storage_location: 'مخزن جاف B',
    warehouse_location: 'مخزن جاف',
    notes: 'للتحمير والسلطات.',
    is_active: true,
  },
  {
    name: 'دقيق متعدد الاستخدام',
    english_name: 'All Purpose Flour',
    sku: 'DRY-FLR',
    barcode: '100000000009',
    category: 'dry_goods',
    subcategory: 'flour',
    base_unit: 'kg',
    purchase_unit: 'bag',
    issue_unit: 'g',
    conversion_factor: 1000,
    unit: 'kg',
    quantity: 25,
    reorder_point: 20,
    cost_per_unit: 18,
    last_purchase_price: 17,
    avg_cost: 16,
    min_purchase_price: 15,
    max_purchase_price: 20,
    min_stock: 20,
    max_stock: 80,
    shelf_life_days: 240,
    lead_time_days: 3,
    supplier_name: 'مطاحن الشروق',
    alternate_supplier_name: 'الدقيق الممتاز',
    storage_location: 'مخزن جاف A',
    warehouse_location: 'مخزن جاف',
    notes: 'أساسي لعجائن التغليف والتحضير.',
    is_active: true,
  },
  {
    name: 'علب تقديم',
    english_name: 'Meal Containers',
    sku: 'PKG-MEAL',
    barcode: '100000000010',
    category: 'packaging',
    subcategory: 'containers',
    base_unit: 'piece',
    purchase_unit: 'carton',
    issue_unit: 'piece',
    conversion_factor: 50,
    unit: 'piece',
    quantity: 120,
    reorder_point: 80,
    cost_per_unit: 4.2,
    last_purchase_price: 4.0,
    avg_cost: 3.9,
    min_purchase_price: 3.7,
    max_purchase_price: 4.5,
    min_stock: 80,
    max_stock: 400,
    shelf_life_days: null,
    lead_time_days: 4,
    supplier_name: 'باك برو',
    alternate_supplier_name: 'التغليف الذكي',
    storage_location: 'مخزن التغليف',
    warehouse_location: 'مخزن التغليف',
    notes: 'للباقات والأطباق الجاهزة.',
    is_active: true,
  },
  {
    name: 'منظف أسطح',
    english_name: 'Surface Cleaner',
    sku: 'CLN-SRF',
    barcode: '100000000011',
    category: 'cleaning',
    subcategory: 'sanitizer',
    base_unit: 'l',
    purchase_unit: 'l',
    issue_unit: 'ml',
    conversion_factor: 1000,
    unit: 'l',
    quantity: 6,
    reorder_point: 4,
    cost_per_unit: 42,
    last_purchase_price: 40,
    avg_cost: 39,
    min_purchase_price: 38,
    max_purchase_price: 45,
    min_stock: 4,
    max_stock: 12,
    shelf_life_days: 365,
    lead_time_days: 2,
    supplier_name: 'النقاء للمستلزمات',
    alternate_supplier_name: 'توب كلين',
    storage_location: 'مخزن المنظفات',
    warehouse_location: 'مخزن المنظفات',
    notes: 'للتعقيم اليومي.',
    is_active: true,
  },
  {
    name: 'مياه معدنية',
    english_name: 'Bottled Water',
    sku: 'DRK-WTR',
    barcode: '100000000012',
    category: 'beverage',
    subcategory: 'water',
    base_unit: 'bottle',
    purchase_unit: 'carton',
    issue_unit: 'bottle',
    conversion_factor: 12,
    unit: 'bottle',
    quantity: 60,
    reorder_point: 48,
    cost_per_unit: 3.2,
    last_purchase_price: 3.0,
    avg_cost: 2.9,
    min_purchase_price: 2.8,
    max_purchase_price: 3.5,
    min_stock: 48,
    max_stock: 120,
    shelf_life_days: 180,
    lead_time_days: 2,
    supplier_name: 'أكوا فلو',
    alternate_supplier_name: 'نقاء للمياه',
    storage_location: 'مخزن مشروبات',
    warehouse_location: 'مخزن المشروبات',
    notes: 'للبيع المرافق وللطلبات.',
    is_active: true,
  },
  {
    name: 'Chicken Alfredo',
    english_name: 'Chicken Alfredo',
    sku: 'FIN-ALF',
    barcode: '100000000013',
    category: 'finished_product',
    subcategory: 'meal',
    base_unit: 'piece',
    purchase_unit: 'piece',
    issue_unit: 'piece',
    conversion_factor: 1,
    unit: 'piece',
    quantity: 24,
    reorder_point: 16,
    cost_per_unit: 48,
    last_purchase_price: 48,
    avg_cost: 46,
    min_purchase_price: 44,
    max_purchase_price: 52,
    sale_price: 95,
    min_stock: 16,
    max_stock: 60,
    shelf_life_days: 2,
    lead_time_days: 0,
    supplier_name: 'الإنتاج الداخلي',
    alternate_supplier_name: 'الإنتاج الداخلي',
    storage_location: 'مخزن المنتجات الجاهزة',
    warehouse_location: 'مخزن المنتجات الجاهزة',
    notes: 'منتج جاهز للبيع المباشر.',
    is_active: true,
  },
  {
    name: 'Chicken Shawarma',
    english_name: 'Chicken Shawarma',
    sku: 'FIN-SHA',
    barcode: '100000000014',
    category: 'finished_product',
    subcategory: 'meal',
    base_unit: 'piece',
    purchase_unit: 'piece',
    issue_unit: 'piece',
    conversion_factor: 1,
    unit: 'piece',
    quantity: 18,
    reorder_point: 12,
    cost_per_unit: 42,
    last_purchase_price: 42,
    avg_cost: 40,
    min_purchase_price: 38,
    max_purchase_price: 46,
    sale_price: 85,
    min_stock: 12,
    max_stock: 48,
    shelf_life_days: 2,
    lead_time_days: 0,
    supplier_name: 'الإنتاج الداخلي',
    alternate_supplier_name: 'الإنتاج الداخلي',
    storage_location: 'مخزن المنتجات الجاهزة',
    warehouse_location: 'مخزن المنتجات الجاهزة',
    notes: 'من المنتجات الأكثر دورانًا.',
    is_active: true,
  },
];

const DEMO_INVENTORY_MOVEMENTS_SEED: InventoryMovementSeed[] = [
  {
    brand_id: 'demo-brand-1',
    item_id: 'demo-item-1',
    batch_id: null,
    warehouse_id: 'wh-cold-1',
    movement_type: 'purchase',
    quantity: 20,
    unit_cost: 162,
    reference_type: 'purchase_order',
    reference_id: 'po-demo-1',
    reason: 'استلام شراء تجريبي',
    user_id: null,
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_INVENTORY_BATCHES_SEED: InventoryBatchSeed[] = [
  {
    brand_id: 'demo-brand-1',
    warehouse_id: 'wh-cold-1',
    item_id: 'demo-item-1',
    batch_no: 'BATCH-20260705-1',
    production_date: '2026-07-01',
    expiry_date: '2026-07-10',
    received_at: new Date().toISOString(),
    quantity_on_hand: 12,
    reserved_qty: 2,
    unit_cost: 162,
    status: 'available',
    notes: 'دفعة تجريبية للـ FEFO',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_INVENTORY_COUNTS_SEED: InventoryCountSeed[] = [
  {
    brand_id: 'demo-brand-1',
    warehouse_id: 'wh-cold-1',
    count_no: 'COUNT-20260705-1',
    count_type: 'spot',
    count_date: '2026-07-05',
    counted_by: null,
    approved_by: null,
    status: 'draft',
    book_qty: 50,
    physical_qty: 48,
    variance_qty: -2,
    variance_ratio: -0.04,
    variance_reason: 'فروقات عدّ أولي',
    notes: 'إجراء استكشافي',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_INVENTORY_TRANSFERS_SEED: InventoryTransferSeed[] = [
  {
    brand_id: 'demo-brand-1',
    transfer_no: 'TRF-20260705-1',
    from_warehouse_id: 'wh-dry-1',
    to_warehouse_id: 'wh-cold-1',
    status: 'approved',
    requested_by: null,
    approved_by: null,
    received_by: null,
    requested_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    received_at: null,
    notes: 'تحويل تجريبي',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const DEMO_INVENTORY_TRANSFER_ITEMS_SEED: InventoryTransferItemSeed[] = [
  {
    transfer_request_id: 'transfer-demo-1',
    item_id: 'demo-item-1',
    batch_id: 'batch-demo-1',
    requested_qty: 5,
    approved_qty: 5,
    received_qty: 0,
    unit_cost: 162,
    notes: 'عنصر تحويل تجريبي',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

function getStorageItems() {
  if (typeof window === 'undefined') {
    return [] as InventoryItem[];
  }

  const rawValue = window.localStorage.getItem(INVENTORY_STORAGE_KEY);
  if (!rawValue) {
    return [] as InventoryItem[];
  }

  try {
    const parsed = JSON.parse(rawValue) as InventoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStorageItems(items: InventoryItem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(INVENTORY_STORAGE_KEY, JSON.stringify(items));
}

function getStorageCollection<T>(key: string) {
  if (typeof window === 'undefined') {
    return [] as T[];
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return [] as T[];
  }

  try {
    const parsed = JSON.parse(rawValue) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [] as T[];
  }
}

function setStorageCollection<T>(key: string, items: T[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(items));
}

function normalizeItem(input: InventoryItemInput): InventoryItem {
  const timestamp = new Date().toISOString();

  return {
    id: input.id ?? crypto.randomUUID(),
    brand_id: input.brand_id,
    name: compactWhitespace(input.name),
    sku: compactWhitespace(input.sku).toUpperCase(),
    category: input.category,
    barcode: compactWhitespace(input.barcode ?? ''),
    english_name: compactWhitespace(input.english_name ?? ''),
    subcategory: compactWhitespace(input.subcategory ?? ''),
    base_unit: input.base_unit,
    purchase_unit: input.purchase_unit,
    issue_unit: input.issue_unit,
    conversion_factor: input.conversion_factor ?? 1,
    weight: input.weight ?? null,
    volume: input.volume ?? null,
    unit: input.unit,
    quantity: Number.isFinite(input.quantity) ? input.quantity : 0,
    reorder_point: Number.isFinite(input.reorder_point) ? input.reorder_point : 0,
    cost_per_unit: input.cost_per_unit === null ? null : Number(input.cost_per_unit),
    last_purchase_price: input.last_purchase_price ?? null,
    avg_cost: input.avg_cost ?? null,
    min_purchase_price: input.min_purchase_price ?? null,
    max_purchase_price: input.max_purchase_price ?? null,
    sale_price: input.sale_price ?? null,
    min_stock: input.min_stock ?? null,
    max_stock: input.max_stock ?? null,
    shelf_life_days: input.shelf_life_days ?? null,
    expiry_date: input.expiry_date ?? null,
    lead_time_days: input.lead_time_days ?? null,
    supplier_name: compactWhitespace(input.supplier_name),
    alternate_supplier_name: compactWhitespace(input.alternate_supplier_name ?? ''),
    storage_location: compactWhitespace(input.storage_location),
    warehouse_location: compactWhitespace(input.warehouse_location ?? input.storage_location),
    image_url: compactWhitespace(input.image_url ?? ''),
    is_active: input.is_active ?? true,
    notes: compactWhitespace(input.notes),
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function getInventoryStatus(item: Pick<InventoryItem, 'quantity' | 'reorder_point'>): InventoryStatus {
  if (item.quantity <= 0) {
    return 'out';
  }

  if (item.quantity <= Math.max(1, item.reorder_point * 0.5)) {
    return 'critical';
  }

  if (item.quantity <= item.reorder_point) {
    return 'low';
  }

  return 'healthy';
}

export function getLocalInventoryItems() {
  return [...getStorageItems()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

export function seedLocalInventoryForBrand(brandId: string) {
  const currentItems = getStorageItems();
  if (currentItems.some((item) => item.brand_id === brandId)) {
    return getLocalInventoryItems();
  }

  const seededItems = DEMO_INVENTORY_SEED.map((seed) => normalizeItem({ ...seed, brand_id: brandId }));
  const nextItems = [...currentItems, ...seededItems];
  setStorageItems(nextItems);

  if (getStorageCollection<InventoryMovement>(INVENTORY_MOVEMENTS_STORAGE_KEY).length === 0) {
    setStorageCollection(INVENTORY_MOVEMENTS_STORAGE_KEY, DEMO_INVENTORY_MOVEMENTS_SEED.map((movement, index) => ({
      ...movement,
      id: `demo-movement-${index + 1}`,
      brand_id: brandId,
      item_id: nextItems[0]?.id ?? movement.item_id,
    })));
  }

  if (getStorageCollection<InventoryBatch>(INVENTORY_BATCHES_STORAGE_KEY).length === 0) {
    setStorageCollection(INVENTORY_BATCHES_STORAGE_KEY, DEMO_INVENTORY_BATCHES_SEED.map((batch, index) => ({
      ...batch,
      id: `demo-batch-${index + 1}`,
      brand_id: brandId,
      item_id: nextItems[0]?.id ?? batch.item_id,
    })));
  }

  if (getStorageCollection<InventoryCount>(INVENTORY_COUNTS_STORAGE_KEY).length === 0) {
    setStorageCollection(INVENTORY_COUNTS_STORAGE_KEY, DEMO_INVENTORY_COUNTS_SEED.map((count, index) => ({
      ...count,
      id: `demo-count-${index + 1}`,
      brand_id: brandId,
    })));
  }

  if (getStorageCollection<InventoryTransfer>(INVENTORY_TRANSFERS_STORAGE_KEY).length === 0) {
    setStorageCollection(INVENTORY_TRANSFERS_STORAGE_KEY, DEMO_INVENTORY_TRANSFERS_SEED.map((transfer, index) => ({
      ...transfer,
      id: `demo-transfer-${index + 1}`,
      brand_id: brandId,
    })));
  }

  if (getStorageCollection<InventoryTransferItem>(INVENTORY_TRANSFER_ITEMS_STORAGE_KEY).length === 0) {
    setStorageCollection(INVENTORY_TRANSFER_ITEMS_STORAGE_KEY, DEMO_INVENTORY_TRANSFER_ITEMS_SEED.map((transferItem, index) => ({
      ...transferItem,
      id: `demo-transfer-item-${index + 1}`,
    })));
  }

  return getLocalInventoryItems();
}

export function upsertLocalInventoryItem(input: InventoryItemInput) {
  const currentItems = getStorageItems();
  const existing = input.id ? currentItems.find((item) => item.id === input.id) : undefined;
  const normalized = normalizeItem({ ...input, id: input.id ?? existing?.id });

  const nextItem: InventoryItem = {
    ...normalized,
    created_at: existing?.created_at ?? normalized.created_at,
    updated_at: new Date().toISOString(),
  };

  const nextItems = existing
    ? currentItems.map((item) => item.id === nextItem.id ? nextItem : item)
    : [nextItem, ...currentItems];

  setStorageItems(nextItems);
  return getLocalInventoryItems();
}

export function deleteLocalInventoryItem(id: string) {
  const nextItems = getStorageItems().filter((item) => item.id !== id);
  setStorageItems(nextItems);
  return getLocalInventoryItems();
}

export function getInventoryMovements() {
  return getStorageCollection<InventoryMovement>(INVENTORY_MOVEMENTS_STORAGE_KEY)
    .sort((left, right) => right.occurred_at.localeCompare(left.occurred_at));
}

export function recordInventoryMovement(input: InventoryMovementInput) {
  const currentMovements = getStorageCollection<InventoryMovement>(INVENTORY_MOVEMENTS_STORAGE_KEY);
  const timestamp = input.occurred_at ?? new Date().toISOString();
  const nextMovement: InventoryMovement = {
    id: crypto.randomUUID(),
    brand_id: input.brand_id,
    item_id: input.item_id,
    batch_id: input.batch_id ?? null,
    warehouse_id: input.warehouse_id ?? null,
    movement_type: input.movement_type,
    quantity: Number.isFinite(input.quantity) ? input.quantity : 0,
    unit_cost: input.unit_cost ?? null,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    reason: input.reason ?? null,
    user_id: input.user_id ?? null,
    occurred_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };

  setStorageCollection(INVENTORY_MOVEMENTS_STORAGE_KEY, [nextMovement, ...currentMovements]);
  return getInventoryMovements();
}

export function getInventoryBatches() {
  return getStorageCollection<InventoryBatch>(INVENTORY_BATCHES_STORAGE_KEY)
    .sort((left, right) => (left.expiry_date ?? '').localeCompare(right.expiry_date ?? ''));
}

export function getInventoryCounts() {
  return getStorageCollection<InventoryCount>(INVENTORY_COUNTS_STORAGE_KEY)
    .sort((left, right) => right.count_date.localeCompare(left.count_date));
}

export function getInventoryTransfers() {
  return getStorageCollection<InventoryTransfer>(INVENTORY_TRANSFERS_STORAGE_KEY)
    .sort((left, right) => right.requested_at.localeCompare(left.requested_at));
}

export function getInventoryTransferItems() {
  return getStorageCollection<InventoryTransferItem>(INVENTORY_TRANSFER_ITEMS_STORAGE_KEY)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export function summarizeInventoryByCategory(items: InventoryItem[]) {
  return items.reduce<Record<InventoryCategory, number>>((summary, item) => {
    summary[item.category] += 1;
    return summary;
  }, {
    protein: 0,
    vegetable: 0,
    carbohydrate: 0,
    dairy: 0,
    sauce: 0,
    spices: 0,
    oils: 0,
    dry_goods: 0,
    packaging: 0,
    cleaning: 0,
    beverage: 0,
    finished_product: 0,
    other: 0,
  });
}

export function summarizeInventoryByLocation(items: InventoryItem[]) {
  return items.reduce<Record<string, number>>((summary, item) => {
    const location = item.warehouse_location || item.storage_location || 'غير محدد';
    summary[location] = (summary[location] || 0) + 1;
    return summary;
  }, {});
}

export function getNearExpiryItems(items: InventoryItem[], withinDays = 30) {
  const now = Date.now();
  const cutoff = now + (withinDays * 24 * 60 * 60 * 1000);

  return items.filter((item) => {
    if (!item.expiry_date) {
      return false;
    }

    const expiryTime = new Date(item.expiry_date).getTime();
    return expiryTime <= cutoff;
  });
}

export function buildReorderSuggestions(items: InventoryItem[]): InventoryReorderSuggestion[] {
  return items
    .filter((item) => item.is_active !== false)
    .filter((item) => item.quantity <= Math.max(item.reorder_point, item.min_stock ?? item.reorder_point))
    .map((item) => ({
      item_id: item.id,
      item_name: item.name,
      sku: item.sku,
      supplier_name: item.supplier_name || item.alternate_supplier_name || 'غير محدد',
      current_quantity: item.quantity,
      reorder_point: item.reorder_point,
      suggested_quantity: Math.max((item.max_stock ?? item.reorder_point * 2) - item.quantity, item.reorder_point - item.quantity + 1),
      last_purchase_price: item.last_purchase_price ?? item.cost_per_unit,
      avg_cost: item.avg_cost ?? item.cost_per_unit,
      lead_time_days: item.lead_time_days ?? null,
      warehouse_location: item.warehouse_location || item.storage_location || 'غير محدد',
      reason: item.quantity <= 0
        ? 'الصنف نفد تمامًا'
        : item.quantity <= Math.max(1, Math.floor(item.reorder_point * 0.5))
          ? 'مخزون حرج يحتاج طلب فوري'
          : 'وصل إلى نقطة إعادة الطلب',
    }))
    .sort((left, right) => left.current_quantity - right.current_quantity);
}

export function summarizeInventoryValue(items: InventoryItem[]) {
  return items.reduce((sum, item) => sum + ((item.cost_per_unit ?? 0) * item.quantity), 0);
}

export function summarizeInventoryByActivity(items: InventoryItem[]) {
  return {
    active: items.filter((item) => item.is_active !== false).length,
    inactive: items.filter((item) => item.is_active === false).length,
  };
}
