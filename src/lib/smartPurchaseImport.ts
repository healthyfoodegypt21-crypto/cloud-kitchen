import type { InventoryUnit } from '@/types/inventory';

export type SmartPurchaseCatalogItem = {
  id: string;
  name: string;
  sku?: string;
  purchaseUnit?: string;
  usageUnit?: string;
};

export type SmartPurchaseLine = {
  id: string;
  sourceName: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  sourceUnit: InventoryUnit | null;
  confirmedUnit: boolean;
  matchConfidence: number;
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

export function unitMatchesInventory(sourceUnit: InventoryUnit | null, item: SmartPurchaseCatalogItem | null): boolean {
  if (!sourceUnit || !item) {
    return true;
  }

  return sourceUnit === normalizePurchaseUnit(item.purchaseUnit) || sourceUnit === normalizePurchaseUnit(item.usageUnit);
}

function tokenSet(value: string) {
  return new Set(normalizeName(value).split(' ').filter(Boolean));
}

function editDistanceAtMostOne(left: string, right: string) {
  if (left === right) return true;
  const lengthDiff = Math.abs(left.length - right.length);
  if (lengthDiff > 1) return false;

  if (lengthDiff === 0) {
    let mismatches = 0;
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) mismatches += 1;
      if (mismatches > 1) return false;
    }
    return true;
  }

  const [shorter, longer] = left.length < right.length ? [left, right] : [right, left];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
      continue;
    }
    if (skipped) return false;
    skipped = true;
    j += 1;
  }
  return true;
}

function tokensMatch(source: string, candidate: string) {
  if (source === candidate) return true;
  if (source.length >= 3 && candidate.startsWith(source)) return true;
  if (candidate.length >= 3 && source.startsWith(candidate)) return true;
  return source.length >= 4 && candidate.length >= 4 && editDistanceAtMostOne(source, candidate);
}

// Token-level fuzzy score: BOTH sides must be fully covered by the other
// (equal, prefix, or one-edit typo), so "Rice flour" never collapses into
// "Rice" while "chiken" still matches "chicken".
function similarityScore(source: string, candidate: string) {
  const sourceTokens = [...tokenSet(source)];
  const candidateTokens = [...tokenSet(candidate)];
  if (sourceTokens.length === 0 || candidateTokens.length === 0) {
    return 0;
  }

  const candidateCovered = candidateTokens.filter((candidateToken) =>
    sourceTokens.some((sourceToken) => tokensMatch(sourceToken, candidateToken)),
  ).length;
  const sourceCovered = sourceTokens.filter((sourceToken) =>
    candidateTokens.some((candidateToken) => tokensMatch(sourceToken, candidateToken)),
  ).length;
  if (candidateCovered < candidateTokens.length || sourceCovered < sourceTokens.length) {
    return 0;
  }

  const exactPairs = candidateTokens.filter((candidateToken) => sourceTokens.includes(candidateToken)).length;
  const precision = exactPairs / Math.max(sourceTokens.length, candidateTokens.length);
  return 0.5 + precision * 0.5;
}

const FUZZY_MATCH_THRESHOLD = 0.5;

function matchInventoryItem(name: string, items: SmartPurchaseCatalogItem[]) {
  const normalizedName = normalizeName(name);
  const exact = items.find((candidate) => (
    normalizeName(candidate.name) === normalizedName
    || normalizeName(candidate.sku ?? '') === normalizedName
  ));
  if (exact) {
    return { id: exact.id, confidence: 1 };
  }

  const best = items
    .map((candidate) => ({
      candidate,
      score: Math.max(
        similarityScore(name, candidate.name),
        candidate.sku ? similarityScore(name, candidate.sku) : 0,
      ),
    }))
    .filter((entry) => entry.score >= FUZZY_MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score)[0];

  return best ? { id: best.candidate.id, confidence: best.score } : { id: '', confidence: 0 };
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

    const matched = matchInventoryItem(sourceName, items);
    lines.push({
      id: `smart-purchase-${index}`,
      sourceName,
      itemId: matched.id,
      quantity,
      unitPrice,
      sourceUnit: normalizePurchaseUnit(match[3]),
      confirmedUnit: true,
      matchConfidence: matched.confidence,
    });
  });

  return { supplierName, lines, ignoredLines };
}
