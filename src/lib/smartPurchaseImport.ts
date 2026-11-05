import type { InventoryUnit } from '@/types/inventory';

export type SmartPurchaseCatalogItem = {
  id: string;
  name: string;
  sku?: string;
};

export type SmartPurchaseLine = {
  id: string;
  sourceName: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  sourceUnit: InventoryUnit | null;
};

export type SmartPurchaseParseResult = {
  supplierName: string;
  lines: SmartPurchaseLine[];
  ignoredLines: string[];
};

const UNIT_PATTERNS: Array<[RegExp, InventoryUnit]> = [
  [/^(?:كجم|كيلو(?:جرام)?|كيلوجرام|kg|kilograms?)$/i, 'kg'],
  [/^(?:جرام|غرام|جم|g|grams?)$/i, 'g'],
  [/^(?:مليلتر|مل|ml|milliliters?)$/i, 'ml'],
  [/^(?:لتر|ليتر|ل|l|liters?|litres?)$/i, 'l'],
  [/^(?:قطعة|قطع|حبة|حبات|piece|pcs?)$/i, 'piece'],
  [/^(?:كرتونة|كرتون|carton)$/i, 'carton'],
  [/^(?:صندوق|بوكس|box)$/i, 'box'],
  [/^(?:صينية|صواني|tray)$/i, 'tray'],
  [/^(?:كيس|أكياس|bag)$/i, 'bag'],
  [/^(?:زجاجة|ازازة|bottle)$/i, 'bottle'],
  [/^(?:علبة|كان|can)$/i, 'can'],
  [/^(?:طقم|set)$/i, 'set'],
  [/^(?:دستة|درزن|dozen)$/i, 'dozen'],
];
const UNIT_ALTERNATIVES = 'كيلوجرام|كيلو(?:جرام)?|كجم|kilograms?|kg|جرام|غرام|grams?|جم|g|مليلتر|milliliters?|ml|ليتر|liters?|litres?|لتر|ل|l|قطعة|قطع|حبات|حبة|pieces?|pcs?|كرتونة|كرتون|cartons?|صندوق|بوكس|boxes|box|صينية|صواني|trays|tray|أكياس|كيس|bags|bag|زجاجة|ازازة|bottles|bottle|علبة|كان|cans|can|طقم|sets|set|دستة|درزن|dozens|dozen';

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0))
    .replace(/[٫٬]/g, (separator) => separator === '٫' ? '.' : ',');
}

function parseNumber(value: string) {
  const normalized = normalizeDigits(value).replace(/\s/g, '');
  const withoutThousands = normalized.replace(/,(?=\d{3}(?:\D|$))/g, '');
  const decimalNormalized = withoutThousands.replace(',', '.');
  const result = Number(decimalNormalized);
  return Number.isFinite(result) ? result : null;
}

function normalizeName(value: string) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizePurchaseUnit(value: string | undefined): InventoryUnit | null {
  if (!value) {
    return null;
  }

  return UNIT_PATTERNS.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

function matchInventoryItem(name: string, items: SmartPurchaseCatalogItem[]) {
  const normalizedName = normalizeName(name);
  const item = items.find((candidate) => (
    normalizeName(candidate.name) === normalizedName
    || normalizeName(candidate.sku ?? '') === normalizedName
  ));

  return item?.id ?? '';
}

export function parseSmartPurchaseMessage(text: string, items: SmartPurchaseCatalogItem[]): SmartPurchaseParseResult {
  let supplierName = '';
  const lines: SmartPurchaseLine[] = [];
  const ignoredLines: string[] = [];
  const normalizedText = normalizeDigits(text);
  const linePattern = new RegExp(
    `^\\s*(.+?)\\s*[:：-]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(${UNIT_ALTERNATIVES})\\s*(?:(?:[x×*@]|سعر(?:\\s*الوحدة)?|unit\\s*price)\\s*)?|\\s*(?:[x×*@]|سعر(?:\\s*الوحدة)?|unit\\s*price)\\s*|\\s+)(\\d+(?:[.,]\\d+)?)\\s*(?:جنيه(?:ات)?|ج\\.م|egp|ج)?\\s*$`,
    'i',
  );

  normalizedText.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    const supplierMatch = line.match(/^(?:المورد|اسم المورد|supplier|vendor)\s*[:：]\s*(.+)$/i);
    if (supplierMatch) {
      supplierName = supplierMatch[1].trim();
      return;
    }

    if (/^(?:الإجمالي|اجمالي|المجموع|total|التاريخ|date)(?:\s|:|$)/i.test(line)) {
      return;
    }

    const match = line.match(linePattern);
    const quantity = match ? parseNumber(match[2]) : null;
    const unitPrice = match ? parseNumber(match[4]) : null;
    const sourceName = match?.[1]?.trim().replace(/[:：-]\s*$/, '') ?? '';

    if (!match || !sourceName || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0) {
      ignoredLines.push(line);
      return;
    }

    lines.push({
      id: `smart-purchase-${index}`,
      sourceName,
      itemId: matchInventoryItem(sourceName, items),
      quantity,
      unitPrice,
      sourceUnit: normalizePurchaseUnit(match[3]),
    });
  });

  return { supplierName, lines, ignoredLines };
}
