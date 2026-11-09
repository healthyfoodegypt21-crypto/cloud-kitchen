import type { InventoryUnit } from '@/types/inventory';
import { compactWhitespace } from '@/lib/utils';

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

export function parseLocalizedNumber(value: string) {
  const normalized = normalizeDigits(value).replace(/\s/g, '');
  const withoutThousands = normalized.replace(/,(?=\d{3}(?:\D|$))/g, '');
  const decimalNormalized = withoutThousands.replace(',', '.');
  const result = Number(decimalNormalized);
  return Number.isFinite(result) ? result : null;
}

export function normalizeDigitsInText(value: string) {
  return normalizeDigits(value);
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

export function matchCatalogItem(name: string, items: SmartPurchaseCatalogItem[]) {
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

export const PURCHASE_UNIT_ALTERNATIVES = UNIT_ALTERNATIVES;

// ---------------------------------------------------------------------------
// Free-form purchase text ("اشتريت 3 جرجير سعر الواحده 3.5 جنيه و نص")
// ---------------------------------------------------------------------------

const PURCHASE_VERB_PATTERN = /^(?:اشتريت|اشترينا|اشتريتها|جبت|جبنا|اخدت|اخذت|واخد|دفعت|جيبت)\s*/u;

const QUANTITY_WORD_TOKENS: Record<string, number> = {
  'واحد': 1, 'واحده': 1, 'واحدة': 1,
  'اتنين': 2, 'اثنين': 2,
  'تلاتة': 3, 'تلاته': 3, 'ثلاثة': 3, 'ثلاثه': 3,
  'اربعة': 4, 'اربعه': 4, 'أربعة': 4,
  'خمسة': 5, 'خمسه': 5,
  'ستة': 6, 'سته': 6,
  'سبعة': 7, 'سبعه': 7,
  'تمانية': 8, 'تمانيه': 8, 'ثمانية': 8,
  'تسعة': 9, 'تسعه': 9,
  'عشرة': 10, 'عشره': 10,
};

const NUMBER_TOKEN = '\\d+(?:[.,]\\d+)?|واحد|واحده|واحدة|اتنين|اثنين|تلاتة|تلاته|ثلاثة|ثلاثه|اربعة|اربعه|أربعة|خمسة|خمسه|ستة|سته|سبعة|سبعه|تمانية|تمانيه|ثمانية|تسعة|تسعه|عشرة|عشره';

const FRACTION_TOKENS: Record<string, number> = { 'نص': 0.5, 'ربع': 0.25, 'تلت': 1 / 3, 'ثلث': 1 / 3 };

const FRACTION_SUFFIX = '(?:\\s*و?\\s*(نص|ربع|تلت|ثلث))?';
const CURRENCY_SUFFIX = '(?:\\s*(?:جنيه(?:ات)?|جنية|جنيهات|ج\\.م|egp|ج))?';

const unitPricePattern = new RegExp(
  `سعر\\s+(?:ال)?(?:واحده|واحد|واحدة|حبه|حبة|طبق|كيلو|كيلوجرام|كجم|جرام|جم|قطعة|قطعه|لتر|علبة|كيس|كرتونة|كرتون)\\s*(${NUMBER_TOKEN})${CURRENCY_SUFFIX}${FRACTION_SUFFIX}`,
  'u',
);
const totalPricePattern = new RegExp(
  `(?:تمن(?:ها|ه)?|ثمن(?:ها|ه)?|بسعر|سعرها|سعره|سعر)\\s*(?:ال)?\\s*(?:بيكون|كان|تكون|هو)?\\s*(${NUMBER_TOKEN})${CURRENCY_SUFFIX}${FRACTION_SUFFIX}`,
  'u',
);
const standaloneTotalPattern = new RegExp(`(?:^|\\s)ب\\s*(${NUMBER_TOKEN})${CURRENCY_SUFFIX}${FRACTION_SUFFIX}`, 'u');
const quantityWithUnitPattern = new RegExp(
  `(${NUMBER_TOKEN})\\s*(واحده|واحد|واحدة|حبه|حبة|طبق|اطباق|أطباق|قطعة|قطعه|قطع|حبات|كيلو|كيلوجرام|كجم|جرام|جم|غرام|لتر|ليتر|علبة|كيس|كرتونة|كرتون|صندوق|بوكس|شوال|دستة|صينية|زجاجة|ازازة)`,
  'u',
);
const containsCountPattern = new RegExp(`فيها\\s*(${NUMBER_TOKEN})\\s*(?:اطباق|أطباق|طبق|حبات|حبه|قطع|قطعة)?`, 'u');
const leadingNumberPattern = new RegExp(`^\\s*(${NUMBER_TOKEN})\\s+`, 'u');
const standaloneNumberPattern = new RegExp(`(${NUMBER_TOKEN})`, 'u');
const supplierPattern = /(?:^|\s)(?:من|عند)\s+([^\d]+?)(?=\s+(?:بسعر|سعرها|سعره|سعر|تمن|ثمن|فيها|يعني|ب\s*\d)|\s*$)/u;

const NAME_FILLER_TOKENS = new Set([
  'يعني', 'تقريبا', 'تقريباً', 'ليهم', 'كلهم', 'النهارده', 'النهاردة', 'امبارح',
  'جنيه', 'جنية', 'جنيهات', 'جم', 'ج', 'بس', 'كده', 'كدا', 'طبعا',
  'سعر', 'بسعر', 'تمن', 'تمنها', 'تمنه', 'ثمن', 'ثمنها', 'ثمنه',
  'فيها', 'بيكون', 'كان', 'تكون', 'هو', 'و', 'ونص', 'نص', 'ربع', 'من', 'عند',
]);

function parseQuantityToken(token: string) {
  const numeric = parseLocalizedNumber(token);
  if (numeric !== null) return numeric;
  return QUANTITY_WORD_TOKENS[token] ?? null;
}

function unitFromToken(token: string): InventoryUnit | null {
  if (/^(?:واحده|واحد|واحدة|حبه|حبة|طبق|اطباق|أطباق|قطعة|قطعه|قطع|حبات)$/u.test(token)) return 'piece';
  return normalizePurchaseUnit(token);
}

function applyFraction(base: number, fractionToken: string | undefined) {
  return base + (fractionToken ? FRACTION_TOKENS[fractionToken] ?? 0 : 0);
}

function parseFreeformPurchaseLine(line: string, index: number): { line: Omit<SmartPurchaseLine, 'itemId' | 'matchConfidence'>; supplierName: string } | null {
  let rest = line.trim().replace(PURCHASE_VERB_PATTERN, '');

  let supplierName = '';
  const supplierMatch = rest.match(supplierPattern);
  if (supplierMatch) {
    supplierName = compactWhitespace(supplierMatch[1]);
    rest = rest.replace(supplierMatch[0], ' ');
  }

  let unitPrice: number | null = null;
  const unitPriceMatch = rest.match(unitPricePattern);
  if (unitPriceMatch) {
    const base = parseQuantityToken(unitPriceMatch[1]);
    if (base !== null) unitPrice = applyFraction(base, unitPriceMatch[2]);
    rest = rest.replace(unitPriceMatch[0], ' ');
  }

  let total: number | null = null;
  const totalMatch = rest.match(totalPricePattern) ?? rest.match(standaloneTotalPattern);
  if (totalMatch) {
    const base = parseQuantityToken(totalMatch[1]);
    if (base !== null) total = applyFraction(base, totalMatch[2]);
    rest = rest.replace(totalMatch[0], ' ');
  }

  let quantity: number | null = null;
  let sourceUnit: InventoryUnit | null = null;
  const quantityMatch = rest.match(quantityWithUnitPattern);
  if (quantityMatch) {
    quantity = parseQuantityToken(quantityMatch[1]);
    sourceUnit = unitFromToken(quantityMatch[2]);
    rest = rest.replace(quantityMatch[0], ' ');
  }
  if (quantity === null) {
    const containsMatch = rest.match(containsCountPattern);
    if (containsMatch) {
      quantity = parseQuantityToken(containsMatch[1]);
      sourceUnit = 'piece';
      rest = rest.replace(containsMatch[0], ' ');
    }
  }
  if (quantity === null) {
    const leadingMatch = rest.match(leadingNumberPattern);
    if (leadingMatch) {
      quantity = parseQuantityToken(leadingMatch[1]);
      rest = rest.replace(leadingMatch[0], ' ');
    }
  }
  if (quantity === null) {
    const standaloneMatch = rest.match(standaloneNumberPattern);
    if (standaloneMatch) {
      quantity = parseQuantityToken(standaloneMatch[1]);
      rest = rest.replace(standaloneMatch[0], ' ');
    }
  }

  const name = compactWhitespace(
    rest.split(/\s+/u)
      .filter(token => token && !NAME_FILLER_TOKENS.has(token) && !/^\d/u.test(token))
      .join(' '),
  );

  if (!name || name.length < 2) return null;
  if (unitPrice === null && total !== null && quantity !== null && quantity > 0) {
    unitPrice = Math.round((total / quantity) * 100) / 100;
  }
  if (unitPrice === null || unitPrice < 0) return null;
  if (quantity === null || quantity <= 0) quantity = 1;

  return {
    supplierName,
    line: {
      id: `smart-purchase-${index}`,
      sourceName: name,
      quantity,
      unitPrice,
      sourceUnit,
      confirmedUnit: true,
    },
  };
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
    const quantity = match ? parseLocalizedNumber(match[2]) : null;
    const unitPrice = match ? parseLocalizedNumber(match[4]) : null;
    const sourceName = match?.[1]?.trim().replace(/[:：-]\s*$/, '') ?? '';

    if (!match || !sourceName || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0) {
      // Free-form fallback: "اشتريت 3 جرجير سعر الواحده 3.5 جنيه و نص"
      const freeform = parseFreeformPurchaseLine(line, index);
      if (!freeform) {
        ignoredLines.push(line);
        return;
      }
      if (!supplierName && freeform.supplierName) {
        supplierName = freeform.supplierName;
      }
      const freeformMatched = matchCatalogItem(freeform.line.sourceName, items);
      lines.push({
        ...freeform.line,
        itemId: freeformMatched.id,
        matchConfidence: freeformMatched.confidence,
      });
      return;
    }

    const matched = matchCatalogItem(sourceName, items);
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
