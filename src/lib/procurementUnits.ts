import { INVENTORY_UNIT_LABELS, type InventoryUnit } from '@/types/inventory';

export type PackMetricUnit = 'g' | 'kg' | 'ml' | 'l';

export type ProcurementUnitItem = {
  purchaseUnit: string;
  usageUnit: string;
  conversionFactor: number;
  packSizeValue?: number | null;
  packSizeUnit?: PackMetricUnit | string | null;
};

export type ConvertedPurchaseLine = {
  quantity: number;
  unitPrice: number;
  usageQuantity?: number;
};

export type CompatibleUnitOption = {
  unit: InventoryUnit;
  label: string;
  shortLabel: string;
  /** How many `usageUnit` equal 1 of `unit` */
  usageFactor: number;
  /** How many `purchaseUnit` equal 1 of `unit` */
  purchaseFactor: number;
};

const UNIT_PATTERNS: Array<[RegExp, InventoryUnit]> = [
  [/^(?:كجم|كيلو(?:جرام)?|كيلوجرام|ك|kg|kilo(?:grams?)?)$/iu, 'kg'],
  [/^(?:جرام|غرام|جم|غ|g|gm|grams?)$/iu, 'g'],
  [/^(?:مليلتر|ملليلتر|ملل?|ml|milliliters?)$/iu, 'ml'],
  [/^(?:لتر|ليتر|ل|l|ltr|liters?|litres?)$/iu, 'l'],
  [/^(?:طبق|أطباق|اطباق|plates?|punnets?)$/iu, 'plate'],
  [/^(?:كرتونة|كرتونه|كرتون|كراتين|cartons?|ctn)$/iu, 'carton'],
  [/^(?:جيركن|جركن|جراكن|jerrycans?)$/iu, 'jerrycan'],
  [/^(?:جردل|جرادل|بستلة|بستله|دلو|buckets?|pails?|tub)$/iu, 'bucket'],
  [/^(?:برطمان|برطمانات|مرطبان|jars?)$/iu, 'jar'],
  [/^(?:زجاجة|زجاجه|ازازة|ازازه|إزازة|عبوة|عبوه|bottles?)$/iu, 'bottle'],
  [/^(?:علبة|علبه|علب|كان|صفيحة|صفيحه|صفائح|cans?|tin)$/iu, 'can'],
  [/^(?:صندوق|صناديق|بوكس|قفص|أقفاص|اقفاص|سبت|برنيكة|برنيكه|boxes|box|crate)$/iu, 'box'],
  [/^(?:كيس|أكياس|اكياس|شيكارة|شيكاره|شكارة|شكاره|شوال|أجولة|اجوله|لفة|لفه|bags?|sack)$/iu, 'bag'],
  [/^(?:باكت|باكيت|بواكي|ظرف|أظرف|اظرف|pack|packets?|sachets?)$/iu, 'packet'],
  [/^(?:ربطة|ربطه|ربط|حزمة|حزمه|حزم|bundles?|bunch(?:es)?)$/iu, 'bundle'],
  [/^(?:صينية|صينيه|صواني|trays?)$/iu, 'tray'],
  [/^(?:قطعة|قطعه|قطع|حبة|حبه|حبات|واحدة|واحده|واحد|رأس|راس|شريط|فرخ|قرص|رغيف|piece|pieces|pcs?|unit)$/iu, 'piece'],
  [/^(?:طقم|أطقم|اطقم|sets?)$/iu, 'set'],
  [/^(?:دستة|دسته|درزن|dozens?)$/iu, 'dozen'],
];

export const PURCHASE_UNIT_ALTERNATIVES =
  'كيلوجرام|كيلو(?:جرام)?|كجم|kilo(?:grams?)?|kg|جرام|غرام|grams?|gm|جم|g|مليلتر|ملليلتر|milliliters?|ملل?|ml|ليتر|liters?|litres?|ltr|لتر|ل|l|أطباق|اطباق|طبق|plates?|punnets?|كرتونة|كرتونه|كرتون|كراتين|cartons?|ctn|جيركن|جركن|جراكن|jerrycans?|جردل|جرادل|بستلة|بستله|دلو|buckets?|pails?|برطمان|برطمانات|jars?|زجاجة|زجاجه|ازازة|ازازه|إزازة|عبوة|عبوه|bottles?|علبة|علبه|علب|صفيحة|صفيحه|كان|cans?|tin|صندوق|بوكس|قفص|برنيكة|برنيكه|boxes|box|أكياس|اكياس|كيس|شيكارة|شيكاره|شكارة|شكاره|شوال|bags?|sack|باكت|باكيت|ظرف|أظرف|اظرف|packets?|sachets?|pack|ربطة|ربطه|ربط|حزمة|حزمه|حزم|bundles?|bunch|صينية|صينيه|صواني|trays?|قطعة|قطعه|قطع|حبات|حبة|حبه|واحدة|واحده|pieces?|pcs?|طقم|sets?|دستة|دسته|درزن|dozens?';

function normalizeArabicDigitsSimple(raw: string): string {
  return raw
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .replace(/[٫]/g, '.');
}

export function parseCompoundPackSpec(rawUnit: string | undefined): {
  unit: InventoryUnit | null;
  packSizeValue: number | null;
  packSizeUnit: PackMetricUnit | null;
} {
  if (!rawUnit) return { unit: null, packSizeValue: null, packSizeUnit: null };
  const trimmed = normalizeArabicDigitsSimple(rawUnit).trim();
  const direct = UNIT_PATTERNS.find(([pattern]) => pattern.test(trimmed))?.[1] ?? null;
  if (direct) {
    return { unit: direct, packSizeValue: null, packSizeUnit: null };
  }

  // Legacy compound strings like "جيركن ٤.٢٤ كيلو" or "طبق 200 جرام"
  const compound = trimmed.match(/^([^\d]+?)\s+(\d+(?:[.,]\d+)?)\s*(.+)$/u);
  if (compound) {
    const baseUnit = UNIT_PATTERNS.find(([pattern]) => pattern.test(compound[1].trim()))?.[1] ?? null;
    const val = Number(compound[2].replace(',', '.'));
    const subUnit = UNIT_PATTERNS.find(([pattern]) => pattern.test(compound[3].trim()))?.[1] ?? null;
    const metricSub: PackMetricUnit | null =
      subUnit === 'kg' || subUnit === 'g' || subUnit === 'l' || subUnit === 'ml' ? subUnit : null;
    return {
      unit: baseUnit,
      packSizeValue: Number.isFinite(val) && val > 0 ? val : null,
      packSizeUnit: metricSub,
    };
  }

  return { unit: null, packSizeValue: null, packSizeUnit: null };
}

export function normalizePurchaseUnit(value: string | undefined): InventoryUnit | null {
  return parseCompoundPackSpec(value).unit;
}

export function getUnitLabel(unit: string | undefined | null): string {
  if (!unit) return 'وحدة';
  const normalized = normalizePurchaseUnit(unit);
  if (normalized && INVENTORY_UNIT_LABELS[normalized]) {
    return INVENTORY_UNIT_LABELS[normalized];
  }
  return INVENTORY_UNIT_LABELS[unit as InventoryUnit] ?? unit;
}

const METRIC_FAMILY: Partial<Record<InventoryUnit, { family: 'mass' | 'volume' | 'count'; toBase: number }>> = {
  g: { family: 'mass', toBase: 1 },
  kg: { family: 'mass', toBase: 1000 },
  ml: { family: 'volume', toBase: 1 },
  l: { family: 'volume', toBase: 1000 },
  piece: { family: 'count', toBase: 1 },
  dozen: { family: 'count', toBase: 12 },
};

/**
 * Returns the exact automatic conversion factor (`how many usageUnits in 1 purchaseUnit`)
 * when both units belong to the same metric/count family (e.g. kg -> g = 1000, l -> ml = 1000, dozen -> piece = 12).
 * Returns `null` when the relationship is item-specific (e.g. carton -> plate = 10, jerrycan -> kg = 4.24).
 */
export function autoConversionFactorBetweenUnits(
  purchaseUnit: string,
  usageUnit: string,
): number | null {
  const p = normalizePurchaseUnit(purchaseUnit);
  const u = normalizePurchaseUnit(usageUnit);
  if (!p || !u) return purchaseUnit === usageUnit ? 1 : null;
  if (p === u) return 1;
  const pMeta = METRIC_FAMILY[p];
  const uMeta = METRIC_FAMILY[u];
  if (pMeta && uMeta && pMeta.family === uMeta.family) {
    return pMeta.toBase / uMeta.toBase;
  }
  return null;
}

export function isContainerUnit(unit: string | undefined | null): boolean {
  const u = normalizePurchaseUnit(unit ?? undefined);
  return u !== null && !['kg', 'g', 'l', 'ml'].includes(u);
}

function roundClean(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function resolveEffectivePackSpec(item: ProcurementUnitItem): {
  packSizeValue: number | null;
  packSizeUnit: PackMetricUnit | null;
} {
  if (
    item.packSizeValue &&
    Number.isFinite(item.packSizeValue) &&
    item.packSizeValue > 0 &&
    item.packSizeUnit &&
    ['g', 'kg', 'ml', 'l'].includes(String(item.packSizeUnit))
  ) {
    return {
      packSizeValue: Number(item.packSizeValue),
      packSizeUnit: item.packSizeUnit as PackMetricUnit,
    };
  }
  const fromUsage = parseCompoundPackSpec(item.usageUnit);
  if (fromUsage.packSizeValue && fromUsage.packSizeUnit) {
    return { packSizeValue: fromUsage.packSizeValue, packSizeUnit: fromUsage.packSizeUnit };
  }
  const fromPurchase = parseCompoundPackSpec(item.purchaseUnit);
  if (fromPurchase.packSizeValue && fromPurchase.packSizeUnit) {
    const factor = Number.isFinite(item.conversionFactor) && item.conversionFactor > 0 ? item.conversionFactor : 1;
    return {
      packSizeValue: fromPurchase.packSizeValue / factor,
      packSizeUnit: fromPurchase.packSizeUnit,
    };
  }
  return { packSizeValue: null, packSizeUnit: null };
}

/**
 * Builds the full graph of compatible units for an item across:
 * 1) Usage unit & Purchase unit (e.g. طبق <-> كرتونة = 10 أطباق)
 * 2) Metric siblings (كيلو <-> جرام, لتر <-> مل, دستة <-> قطعة)
 * 3) Container net weight/volume (`packSizeValue` + `packSizeUnit`, e.g. طبق = 200 جرام, جيركن = 4.24 كجم, جردل = 10 لتر)
 */
export function getCompatibleUnitsForItem(item: ProcurementUnitItem): CompatibleUnitOption[] {
  const factor = Number.isFinite(item.conversionFactor) && item.conversionFactor > 0 ? item.conversionFactor : 1;
  const usageUnit = normalizePurchaseUnit(item.usageUnit) ?? 'piece';
  const purchaseUnit = normalizePurchaseUnit(item.purchaseUnit) ?? usageUnit;
  const { packSizeValue, packSizeUnit } = resolveEffectivePackSpec(item);

  // Map: unit -> how many `usageUnit` equal 1 of `unit`
  const usageFactors = new Map<InventoryUnit, number>();
  usageFactors.set(usageUnit, 1);
  if (!usageFactors.has(purchaseUnit)) {
    usageFactors.set(purchaseUnit, factor);
  }

  const expandMetricSiblings = (anchorUnit: InventoryUnit, anchorUsageFactor: number) => {
    const meta = METRIC_FAMILY[anchorUnit];
    if (!meta) return;
    (Object.entries(METRIC_FAMILY) as Array<[InventoryUnit, { family: string; toBase: number }]>).forEach(
      ([sibling, sibMeta]) => {
        if (sibMeta && sibMeta.family === meta.family && !usageFactors.has(sibling)) {
          const ratio = sibMeta.toBase / meta.toBase;
          usageFactors.set(sibling, anchorUsageFactor * ratio);
        }
      },
    );
  };

  expandMetricSiblings(usageUnit, 1);
  expandMetricSiblings(purchaseUnit, usageFactors.get(purchaseUnit)!);

  // Bridge container unit <-> weight/volume via packSizeValue + packSizeUnit (1 usageUnit = packSizeValue packSizeUnit)
  if (packSizeValue && packSizeUnit && !usageFactors.has(packSizeUnit)) {
    const oneMetricInUsage = 1 / packSizeValue;
    usageFactors.set(packSizeUnit, oneMetricInUsage);
    expandMetricSiblings(packSizeUnit, oneMetricInUsage);
  }

  const options: CompatibleUnitOption[] = [];
  for (const [unit, uFactor] of usageFactors.entries()) {
    const shortLabel = getUnitLabel(unit);
    let detail = '';

    if (unit === usageUnit && packSizeValue && packSizeUnit && unit !== packSizeUnit) {
      detail = `${packSizeValue.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${getUnitLabel(packSizeUnit)}`;
    } else if (unit === purchaseUnit && purchaseUnit !== usageUnit) {
      const subParts = [`${factor.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${getUnitLabel(usageUnit)}`];
      if (packSizeValue && packSizeUnit) {
        const totalPack = factor * packSizeValue;
        if ((packSizeUnit === 'g' || packSizeUnit === 'ml') && totalPack >= 1000) {
          const bigUnit = packSizeUnit === 'g' ? 'كجم' : 'لتر';
          subParts.push(`${(totalPack / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 })} ${bigUnit}`);
        } else {
          subParts.push(`${totalPack.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${getUnitLabel(packSizeUnit)}`);
        }
      }
      detail = subParts.join(' · ');
    }

    options.push({
      unit,
      shortLabel,
      label: detail ? `${shortLabel} (${detail})` : shortLabel,
      usageFactor: uFactor,
      purchaseFactor: uFactor / factor,
    });
  }

  return options;
}

export function formatItemUnitSummary(item: ProcurementUnitItem): string {
  const factor = Number.isFinite(item.conversionFactor) && item.conversionFactor > 0 ? item.conversionFactor : 1;
  const uLabel = getUnitLabel(item.usageUnit);
  const pLabel = getUnitLabel(item.purchaseUnit);
  const { packSizeValue, packSizeUnit } = resolveEffectivePackSpec(item);
  const parts: string[] = [];

  if (normalizePurchaseUnit(item.purchaseUnit) !== normalizePurchaseUnit(item.usageUnit) || factor !== 1) {
    parts.push(`1 ${pLabel} = ${factor.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${uLabel}`);
  }
  if (packSizeValue && packSizeUnit && normalizePurchaseUnit(item.usageUnit) !== packSizeUnit) {
    parts.push(`1 ${uLabel} = ${packSizeValue.toLocaleString('en-US', { maximumFractionDigits: 3 })} ${getUnitLabel(packSizeUnit)}`);
  }
  return parts.join(' · ');
}

export function formatEquivalentStockHint(onHandUsage: number, item: ProcurementUnitItem): string {
  if (!Number.isFinite(onHandUsage) || onHandUsage <= 0) return formatItemUnitSummary(item);
  const factor = Number.isFinite(item.conversionFactor) && item.conversionFactor > 0 ? item.conversionFactor : 1;
  const usageNorm = normalizePurchaseUnit(item.usageUnit);
  const purchaseNorm = normalizePurchaseUnit(item.purchaseUnit);
  const { packSizeValue, packSizeUnit } = resolveEffectivePackSpec(item);
  const equivalents: string[] = [];

  if (purchaseNorm && usageNorm && purchaseNorm !== usageNorm && factor > 0 && !(purchaseNorm === 'kg' && usageNorm === 'g') && !(purchaseNorm === 'l' && usageNorm === 'ml')) {
    const inPurchase = Math.round((onHandUsage / factor) * 100) / 100;
    equivalents.push(`${inPurchase.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${getUnitLabel(purchaseNorm)}`);
  }

  if (packSizeValue && packSizeUnit) {
    const totalMetric = onHandUsage * packSizeValue;
    if (packSizeUnit === 'g' && totalMetric >= 1000) {
      equivalents.push(`${(Math.round((totalMetric / 1000) * 1000) / 1000).toLocaleString('en-US')} كجم`);
    } else if (packSizeUnit === 'ml' && totalMetric >= 1000) {
      equivalents.push(`${(Math.round((totalMetric / 1000) * 1000) / 1000).toLocaleString('en-US')} لتر`);
    } else {
      equivalents.push(`${(Math.round(totalMetric * 100) / 100).toLocaleString('en-US')} ${getUnitLabel(packSizeUnit)}`);
    }
  } else if (usageNorm === 'kg') {
    equivalents.push(`${Math.round(onHandUsage * 1000).toLocaleString('en-US')} جرام`);
  } else if (usageNorm === 'g' && onHandUsage >= 1000) {
    equivalents.push(`${(Math.round((onHandUsage / 1000) * 1000) / 1000).toLocaleString('en-US')} كجم`);
  } else if (usageNorm === 'l') {
    equivalents.push(`${Math.round(onHandUsage * 1000).toLocaleString('en-US')} مل`);
  } else if (usageNorm === 'ml' && onHandUsage >= 1000) {
    equivalents.push(`${(Math.round((onHandUsage / 1000) * 1000) / 1000).toLocaleString('en-US')} لتر`);
  }

  return equivalents.join(' · ');
}

export function suggestPurchaseQuantity(minimumUsageQuantity: number, onHandUsageQuantity: number, conversionFactor: number): number {
  const factor = Number.isFinite(conversionFactor) && conversionFactor > 0 ? conversionFactor : 1;
  const minimum = Number.isFinite(minimumUsageQuantity) ? Math.max(minimumUsageQuantity, 0) : 0;
  const onHand = Number.isFinite(onHandUsageQuantity) ? Math.max(onHandUsageQuantity, 0) : 0;
  const shortageInUsageUnits = Math.max(minimum * 2 - onHand, 0);
  return shortageInUsageUnits === 0 ? 0 : Math.max(shortageInUsageUnits / factor, 0.001);
}

export function convertInvoiceLineToPurchaseUnit(
  quantity: number,
  unitPrice: number,
  sourceUnit: InventoryUnit | string | null | undefined,
  item: ProcurementUnitItem,
): ConvertedPurchaseLine | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }
  if (!Number.isFinite(item.conversionFactor) || item.conversionFactor <= 0) {
    return null;
  }

  const normalizedSource = sourceUnit ? normalizePurchaseUnit(String(sourceUnit)) : null;
  const purchaseNorm = normalizePurchaseUnit(item.purchaseUnit);

  if (!normalizedSource || normalizedSource === purchaseNorm) {
    return {
      quantity,
      unitPrice,
      usageQuantity: roundClean(quantity * item.conversionFactor, 4),
    };
  }

  const compatible = getCompatibleUnitsForItem(item).find((opt) => opt.unit === normalizedSource);
  if (!compatible || compatible.purchaseFactor <= 0) {
    return null;
  }

  return {
    quantity: roundClean(quantity * compatible.purchaseFactor, 6),
    unitPrice: roundClean(unitPrice / compatible.purchaseFactor, 4),
    usageQuantity: roundClean(quantity * compatible.usageFactor, 4),
  };
}

export function convertWithdrawalToUsageUnit(
  quantity: number,
  sourceUnit: InventoryUnit | string | null | undefined,
  item: ProcurementUnitItem,
): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }
  const normalizedSource = sourceUnit ? normalizePurchaseUnit(String(sourceUnit)) : null;
  const usageNorm = normalizePurchaseUnit(item.usageUnit);
  if (!normalizedSource || normalizedSource === usageNorm) {
    return roundClean(quantity, 4);
  }
  const compatible = getCompatibleUnitsForItem(item).find((opt) => opt.unit === normalizedSource);
  if (!compatible || compatible.usageFactor <= 0) {
    return null;
  }
  return roundClean(quantity * compatible.usageFactor, 4);
}

