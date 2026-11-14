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
  category: string;
};

export type SmartPurchaseParseResult = {
  supplierName: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  taxAmount?: number;
  discountAmount?: number;
  paymentMethod?: 'cash' | 'bank_transfer' | 'credit';
  lines: SmartPurchaseLine[];
  ignoredLines: string[];
};

const UNIT_PATTERNS: Array<[RegExp, InventoryUnit]> = [
  [/^(?:كجم|كيلو(?:جرام)?|كيلوجرام|ك|kg|kilo(?:grams?)?)$/i, 'kg'],
  [/^(?:جرام|غرام|جم|غ|g|gm|grams?)$/i, 'g'],
  [/^(?:مليلتر|ملل?|ml|milliliters?)$/i, 'ml'],
  [/^(?:لتر|ليتر|ل|l|ltr|liters?|litres?)$/i, 'l'],
  [/^(?:قطعة|قطعه|قطع|حبة|حبه|حبات|واحدة|واحده|واحد|رأس|راس|ربطة|ربطه|حزمة|حزمه|شريط|فرخ|قرص|رغيف|piece|pieces|pcs?|unit)$/i, 'piece'],
  [/^(?:كرتونة|كرتونه|كرتون|كراتين|cartons?|ctn)$/i, 'carton'],
  [/^(?:صندوق|صناديق|بوكس|قفص|أقفاص|اقفاص|سبت|برنيكة|برنيكه|boxes|box|crate)$/i, 'box'],
  [/^(?:صينية|صينيه|صواني|طبق|أطباق|اطباق|trays?)$/i, 'tray'],
  [/^(?:كيس|أكياس|اكياس|شيكارة|شيكاره|شكارة|شكاره|شوال|أجولة|اجوله|باكت|باكيت|لفة|لفه|bags?|sack|pack|packet)$/i, 'bag'],
  [/^(?:زجاجة|زجاجه|ازازة|ازازه|إزازة|جركن|جراكن|عبوة|عبوه|برطمان|bottles?|jar|jerrycan)$/i, 'bottle'],
  [/^(?:علبة|علبه|علب|كان|صفيحة|صفيحه|صفائح|بستلة|بستله|cans?|tin|tub)$/i, 'can'],
  [/^(?:طقم|أطقم|اطقم|sets?)$/i, 'set'],
  [/^(?:دستة|دسته|درزن|dozens?)$/i, 'dozen'],
];
const UNIT_ALTERNATIVES =
  'كيلوجرام|كيلو(?:جرام)?|كجم|kilo(?:grams?)?|kg|جرام|غرام|grams?|gm|جم|g|مليلتر|milliliters?|ملل?|ml|ليتر|liters?|litres?|ltr|لتر|ل|l|قطعة|قطعه|قطع|حبات|حبة|حبه|واحدة|واحده|ربطة|ربطه|حزمة|حزمه|pieces?|pcs?|كرتونة|كرتونه|كرتون|كراتين|cartons?|ctn|صندوق|بوكس|قفص|برنيكة|برنيكه|boxes|box|صينية|صينيه|صواني|أطباق|اطباق|طبق|trays?|أكياس|اكياس|كيس|شيكارة|شيكاره|شكارة|شكاره|شوال|باكت|باكيت|bags?|sack|pack|زجاجة|زجاجه|ازازة|ازازه|إزازة|جركن|عبوة|عبوه|برطمان|bottles?|jar|علبة|علبه|علب|صفيحة|صفيحه|بستلة|بستله|كان|cans?|tin|طقم|sets?|دستة|دسته|درزن|dozens?';

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

const ARABIC_SYNONYM_MAP: Record<string, string> = {
  فراخ: 'دجاج',
  فرخه: 'دجاج',
  تشيكن: 'دجاج',
  رز: 'ارز',
  بطاطا: 'بطاطس',
  قوطه: 'طماطم',
  بندوره: 'طماطم',
  لحمه: 'لحم',
  بيف: 'لحم',
  ستيك: 'استيك',
  سلمون: 'سالمون',
  كليماري: 'كالماري',
  معكرونه: 'مكرونه',
  باستا: 'مكرونه',
  لبن: 'حليب',
};

function normalizeArabicToken(token: string): string {
  // Strip definite article "ال" on Arabic words with >= 4 letters (e.g. "الطماطم" -> "طماطم")
  const stripped = /^ال[\u0600-\u06FF]{2,}$/u.test(token) ? token.slice(2) : token;
  return ARABIC_SYNONYM_MAP[stripped] ?? stripped;
}

function tokenSet(value: string) {
  return new Set(
    normalizeName(value)
      .split(' ')
      .filter(Boolean)
      .map(normalizeArabicToken),
  );
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
  const normalizedTokenJoined = [...tokenSet(name)].join(' ');
  const exact = items.find((candidate) => (
    normalizeName(candidate.name) === normalizedName
    || [...tokenSet(candidate.name)].join(' ') === normalizedTokenJoined
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

const PURCHASE_VERB_PATTERN = /^(?:اشتريت|اشترينا|اشتريتها|جبت|جبنا|اخدت|اخذت|واخد|دفعت|جيبت|سجل|اشترى)\s*/u;

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

const FRACTION_TOKENS: Record<string, number> = {
  'نص': 0.5,
  'نصف': 0.5,
  'ربع': 0.25,
  'تلت': 1 / 3,
  'ثلث': 1 / 3,
  'تمن': 0.125,
  'ثمن': 0.125,
};

const FRACTION_SUFFIX = '(?:\\s*و?\\s*(نص|نصف|ربع|تلت|ثلث))?';
const CURRENCY_SUFFIX = '(?:\\s*(?:جنيه(?:ات)?|جنية|جنيهات|ج\\.م\\.?|جم|egp|le|ج))?';

const PER_UNIT_NOUNS =
  'واحده|واحد|واحدة|حبه|حبة|طبق|كيلو|كيلوجرام|كجم|جرام|جم|قطعة|قطعه|لتر|علبة|علبه|كيس|شيكارة|شيكاره|شكارة|شكاره|شوال|كرتونة|كرتونه|كرتون|صفيحة|صفيحه|بستلة|بستله|زجاجة|زجاجه|ازازة|ازازه|جركن|ربطة|ربطه|حزمة|حزمه|صندوق|بوكس|دستة|دسته';

// Matches BOTH "سعر الكيلو 30" AND "الكيلو ب 30" / "للكيلو 30" / "العلبة ب 15"
const unitPricePattern = new RegExp(
  `(?:سعر\\s+(?:ال)?(?:${PER_UNIT_NOUNS})|(?:ال(?:${PER_UNIT_NOUNS})|لل(?:${PER_UNIT_NOUNS}))\\s*(?:بـ?\\s*|عامل\\s*|بيكون\\s*|على\\s*|هو\\s*|:|=))\\s*(?:بـ?\\s*)?(${NUMBER_TOKEN})${CURRENCY_SUFFIX}${FRACTION_SUFFIX}`,
  'iu',
);
const totalPricePattern = new RegExp(
  `(?:تمن(?:ها|ه|هم)?|ثمن(?:ها|ه|هم)?|بسعر|سعرها|سعره|سعر|الحساب|حسابهم|حسابها|إجمالي|اجمالي|=)\\s*(?:ال)?\\s*(?:بيكون|كان|تكون|هو)?\\s*(${NUMBER_TOKEN})${CURRENCY_SUFFIX}${FRACTION_SUFFIX}`,
  'iu',
);
const standaloneTotalPattern = new RegExp(`(?:^|\\s)بـ?\\s*(${NUMBER_TOKEN})${CURRENCY_SUFFIX}${FRACTION_SUFFIX}`, 'iu');

const UNIT_WORDS_LIST =
  'واحده|واحد|واحدة|حبه|حبة|طبق|اطباق|أطباق|قطعة|قطعه|قطع|حبات|كيلو|كيلوجرام|كجم|جرام|جم|غرام|لتر|ليتر|علبة|علبه|علب|كيس|أكياس|اكياس|شيكارة|شيكاره|شكارة|شكاره|كرتونة|كرتونه|كرتون|كراتين|صندوق|بوكس|شوال|دستة|دسته|صينية|صينيه|زجاجة|زجاجه|ازازة|ازازه|جركن|ربطة|ربطه|حزمة|حزمه|صفيحة|صفيحه|بستلة|بستله|kg|g|gm|ml|l|pcs?|piece|bag|carton|box|can|bottle|tray';

const leadingFractionUnitPattern = new RegExp(
  `(?:^|\\s)(نص|نصف|ربع|تلت|ثلث)\\s+(${UNIT_WORDS_LIST})(?=\\s|$)`,
  'iu',
);
const unitAndFractionPattern = new RegExp(
  `(?:^|\\s)(${UNIT_WORDS_LIST})\\s+و\\s*(نص|نصف|ربع|تلت|ثلث)(?=\\s|$)`,
  'iu',
);
const quantityWithUnitAndFractionPattern = new RegExp(
  `(${NUMBER_TOKEN})\\s*(${UNIT_WORDS_LIST})(?:\\s*و\\s*(نص|نصف|ربع|تلت|ثلث))?`,
  'iu',
);
const implicitOneUnitAtStartPattern = new RegExp(
  `^\\s*(كيلو|كيلوجرام|كرتونة|كرتونه|كرتون|شيكارة|شيكاره|شكارة|شكاره|شوال|صفيحة|صفيحه|بستلة|بستله|جركن|دستة|دسته|صندوق|بوكس|علبة|علبه|زجاجة|زجاجه|ازازة|ازازه|ربطة|ربطه|حزمة|حزمه)\\s+`,
  'iu',
);
const containsCountPattern = new RegExp(`فيها\\s*(${NUMBER_TOKEN})\\s*(?:اطباق|أطباق|طبق|حبات|حبه|قطع|قطعة)?`, 'u');
const leadingNumberPattern = new RegExp(`^\\s*(${NUMBER_TOKEN})\\s+`, 'u');
const standaloneNumberPattern = new RegExp(`(${NUMBER_TOKEN})`, 'u');
const supplierPattern = /(?:^|\s)(?:من\s+عند|من|عند)\s+([^\d]+?)(?=\s+(?:بسعر|سعرها|سعره|سعر|تمن|ثمن|فيها|يعني|بـ?\s*\d|الكيلو|الواحده|الواحدة)|\s*$)/u;

const NAME_FILLER_TOKENS = new Set([
  'يعني', 'تقريبا', 'تقريباً', 'ليهم', 'كلهم', 'النهارده', 'النهاردة', 'امبارح',
  'جنيه', 'جنية', 'جنيهات', 'جم', 'ج', 'ج.م', 'بس', 'كده', 'كدا', 'طبعا',
  'سعر', 'بسعر', 'تمن', 'تمنها', 'تمنه', 'ثمن', 'ثمنها', 'ثمنه',
  'فيها', 'بيكون', 'كان', 'تكون', 'هو', 'و', 'ونص', 'نص', 'نصف', 'ربع', 'من', 'عند', 'حساب', 'الحساب',
]);

function parseQuantityToken(token: string) {
  const numeric = parseLocalizedNumber(token);
  if (numeric !== null) return numeric;
  return QUANTITY_WORD_TOKENS[token] ?? null;
}

function unitFromToken(token: string): InventoryUnit | null {
  if (/^(?:واحده|واحد|واحدة|حبه|حبة|طبق|اطباق|أطباق|قطعة|قطعه|قطع|حبات|ربطة|ربطه|حزمة|حزمه)$/iu.test(token)) return 'piece';
  return normalizePurchaseUnit(token);
}

function applyFraction(base: number, fractionToken: string | undefined) {
  return base + (fractionToken ? FRACTION_TOKENS[fractionToken] ?? 0 : 0);
}

function stripLeadingRowSerial(line: string): string {
  // Strips "1 - ", "1) ", "1. ", "#1 " at start of invoice rows when followed by Arabic/Latin letters
  return line.replace(/^\s*#?\d{1,2}\s*(?:[.)\-–—]|\|)\s*(?=[\p{L}])/u, '').trim();
}

/**
 * Parses pipe-delimited or multi-column invoice table rows (including AI Vision output & RTL/LTR OCR tables):
 * - "طماطم | 5 | كجم | 30"
 * - "1 | صدور دجاج | كجم | 10 | 185 | 1850"
 * - "طماطم 5 كجم 30 150" (where 5 × 30 = 150)
 * - "150 30 5 كجم طماطم" (RTL OCR table order where 5 × 30 = 150)
 */
function parseStructuredInvoiceRow(
  rawLine: string,
  index: number,
): Omit<SmartPurchaseLine, 'itemId' | 'matchConfidence'> | null {
  const line = stripLeadingRowSerial(rawLine);

  // Case 1: Pipe-delimited columns ("Name | Qty | Unit | Price [| Total]")
  if (line.includes('|')) {
    const cells = line
      .split('|')
      .map((c) => compactWhitespace(c))
      .filter(Boolean);

    if (cells.length >= 3) {
      let sourceUnit: InventoryUnit | null = null;
      const numericValues: number[] = [];
      const textCells: string[] = [];

      for (const cell of cells) {
        const cleanCell = cell.replace(/\s*(?:جنيه(?:ات)?|جنية|ج\.م\.?|egp|ج)\s*$/iu, '').trim();
        const unitOnly = normalizePurchaseUnit(cleanCell);
        if (unitOnly) {
          sourceUnit = sourceUnit ?? unitOnly;
          continue;
        }
        const qtyUnitMatch = cleanCell.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_ALTERNATIVES})$`, 'iu'));
        if (qtyUnitMatch) {
          const num = parseLocalizedNumber(qtyUnitMatch[1]);
          if (num !== null) {
            numericValues.push(num);
            sourceUnit = sourceUnit ?? normalizePurchaseUnit(qtyUnitMatch[2]);
            continue;
          }
        }
        const numOnly = parseLocalizedNumber(cleanCell);
        if (numOnly !== null && /^[\d.,]+$/.test(cleanCell)) {
          numericValues.push(numOnly);
          continue;
        }
        textCells.push(cleanCell);
      }

      // Drop leading serial number if 4 numbers exist (e.g. [1, 10, 185, 1850])
      if (
        numericValues.length === 4 &&
        Number.isInteger(numericValues[0]) &&
        numericValues[0] <= 50 &&
        Math.abs(numericValues[1] * numericValues[2] - numericValues[3]) <= Math.max(1, numericValues[3] * 0.02)
      ) {
        numericValues.shift();
      }

      const sourceName = compactWhitespace(textCells.join(' '));
      if (sourceName && /[\p{L}]/u.test(sourceName) && numericValues.length >= 2) {
        let quantity = numericValues[0];
        let unitPrice = numericValues[1];
        if (numericValues.length >= 3) {
          const [a, b, c] = numericValues;
          if (Math.abs(a * b - c) <= Math.max(1, c * 0.02)) {
            quantity = a;
            unitPrice = b;
          } else if (Math.abs(b * c - a) <= Math.max(1, a * 0.02)) {
            // RTL column order: Total | UnitPrice | Qty
            quantity = c;
            unitPrice = b;
          }
        }
        if (quantity > 0 && unitPrice >= 0) {
          return {
            id: `smart-purchase-${index}`,
            sourceName,
            quantity,
            unitPrice,
            sourceUnit,
            confirmedUnit: true,
            category: 'other',
          };
        }
      }
    }
  }

  // Case 2: Leading quantity with × / * / @ operator ("5 كجم طماطم × 30" or "5 طماطم * 30")
  const leadingMultMatch = line.match(
    new RegExp(
      `^\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:(${UNIT_ALTERNATIVES})\\s+)?([\\p{L}][^x×*@=\\d]+?)\\s*[x×*@]\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:جنيه(?:ات)?|ج\\.م\\.?|egp|ج)?\\s*$`,
      'iu',
    ),
  );
  if (leadingMultMatch) {
    const quantity = parseLocalizedNumber(leadingMultMatch[1]);
    const sourceUnit = normalizePurchaseUnit(leadingMultMatch[2]);
    const sourceName = compactWhitespace(leadingMultMatch[3]);
    const unitPrice = parseLocalizedNumber(leadingMultMatch[4]);
    if (sourceName && quantity && quantity > 0 && unitPrice !== null && unitPrice >= 0) {
      return {
        id: `smart-purchase-${index}`,
        sourceName,
        quantity,
        unitPrice,
        sourceUnit,
        confirmedUnit: true,
        category: 'other',
      };
    }
  }

  // Case 3: 3-number invoice row without pipes where Qty × UnitPrice ≈ Total
  // Supports both LTR ("طماطم 5 كجم 30 150") and RTL ("150 30 5 كجم طماطم")
  const ltrThreeNum = line.match(
    new RegExp(
      `^([\\p{L}][^\\d]+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:(${UNIT_ALTERNATIVES})\\s+)?(\\d+(?:[.,]\\d+)?)\\s+(?:=\\s*)?(\\d+(?:[.,]\\d+)?)\\s*(?:جنيه(?:ات)?|ج\\.م\\.?|egp|ج)?$`,
      'iu',
    ),
  );
  if (ltrThreeNum) {
    const sourceName = compactWhitespace(ltrThreeNum[1].replace(/[:：\-–—]+$/u, ''));
    const a = parseLocalizedNumber(ltrThreeNum[2]);
    const sourceUnit = normalizePurchaseUnit(ltrThreeNum[3]);
    const b = parseLocalizedNumber(ltrThreeNum[4]);
    const c = parseLocalizedNumber(ltrThreeNum[5]);
    if (sourceName && a && b !== null && c !== null && a > 0 && b >= 0 && Math.abs(a * b - c) <= Math.max(1, c * 0.02)) {
      return {
        id: `smart-purchase-${index}`,
        sourceName,
        quantity: a,
        unitPrice: b,
        sourceUnit,
        confirmedUnit: true,
        category: 'other',
      };
    }
  }

  const rtlThreeNum = line.match(
    new RegExp(
      `^(\\d+(?:[.,]\\d+)?)\\s+(\\d+(?:[.,]\\d+)?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:(${UNIT_ALTERNATIVES})\\s+)?([\\p{L}].+?)$`,
      'iu',
    ),
  );
  if (rtlThreeNum) {
    const totalCandidate = parseLocalizedNumber(rtlThreeNum[1]);
    const priceCandidate = parseLocalizedNumber(rtlThreeNum[2]);
    const qtyCandidate = parseLocalizedNumber(rtlThreeNum[3]);
    const sourceUnit = normalizePurchaseUnit(rtlThreeNum[4]);
    const sourceName = compactWhitespace(rtlThreeNum[5]);
    if (
      sourceName &&
      totalCandidate !== null &&
      priceCandidate !== null &&
      qtyCandidate !== null &&
      qtyCandidate > 0 &&
      Math.abs(qtyCandidate * priceCandidate - totalCandidate) <= Math.max(1, totalCandidate * 0.02)
    ) {
      return {
        id: `smart-purchase-${index}`,
        sourceName,
        quantity: qtyCandidate,
        unitPrice: priceCandidate,
        sourceUnit,
        confirmedUnit: true,
        category: 'other',
      };
    }
  }

  return null;
}

function parseFreeformPurchaseLine(line: string, index: number): { line: Omit<SmartPurchaseLine, 'itemId' | 'matchConfidence'>; supplierName: string } | null {
  let rest = stripLeadingRowSerial(line).replace(PURCHASE_VERB_PATTERN, '');

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

  // Check "نص كيلو" / "ربع كيلو" first
  const fracUnitMatch = rest.match(leadingFractionUnitPattern);
  if (fracUnitMatch) {
    quantity = FRACTION_TOKENS[fracUnitMatch[1]] ?? null;
    sourceUnit = unitFromToken(fracUnitMatch[2]);
    rest = rest.replace(fracUnitMatch[0], ' ');
  }

  // Check "2 كيلو ونص" or "5 كيلو" BEFORE bare "كيلو ونص" so "2 كيلو ونص" isn't partially matched as "كيلو ونص"
  if (quantity === null) {
    const quantityMatch = rest.match(quantityWithUnitAndFractionPattern);
    if (quantityMatch) {
      const baseQty = parseQuantityToken(quantityMatch[1]);
      if (baseQty !== null) {
        quantity = applyFraction(baseQty, quantityMatch[3]);
      }
      sourceUnit = unitFromToken(quantityMatch[2]);
      rest = rest.replace(quantityMatch[0], ' ');
    }
  }

  // Check bare "كيلو ونص" (1.5 kg) when no number precedes the unit
  if (quantity === null) {
    const unitFracMatch = rest.match(unitAndFractionPattern);
    if (unitFracMatch) {
      quantity = 1 + (FRACTION_TOKENS[unitFracMatch[2]] ?? 0);
      sourceUnit = unitFromToken(unitFracMatch[1]);
      rest = rest.replace(unitFracMatch[0], ' ');
    }
  }

  // Check implicit 1 unit at start: "كيلو طماطم ب 25" / "كرتونة بيض ب 165"
  if (quantity === null) {
    const implicitOne = rest.match(implicitOneUnitAtStartPattern);
    if (implicitOne) {
      quantity = 1;
      sourceUnit = unitFromToken(implicitOne[1]);
      rest = rest.replace(implicitOne[0], ' ');
    }
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
      category: 'other',
    },
  };
}

function normalizeParsedInvoiceDate(raw: string): string | undefined {
  const cleaned = compactWhitespace(raw);
  const isoMatch = cleaned.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const dmyMatch = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return undefined;
}

const SKIP_PURCHASE_META_PATTERN =
  /^(?:الإجمالي|اجمالي|المجموع|الصافي|صافي\s*الفاتورة|subtotal|grand\s*total|total|الصنف\s+الكمية|م\s+الصنف|توقيع|شكراً|شكرا\s*لتعاملكم)(?:\s|:|$)/iu;

export function parseSmartPurchaseMessage(text: string, items: SmartPurchaseCatalogItem[]): SmartPurchaseParseResult {
  let supplierName = '';
  let invoiceNumber: string | undefined;
  let invoiceDate: string | undefined;
  let taxAmount: number | undefined;
  let discountAmount: number | undefined;
  let paymentMethod: SmartPurchaseParseResult['paymentMethod'];
  const lines: SmartPurchaseLine[] = [];
  const ignoredLines: string[] = [];
  const normalizedText = normalizeDigits(text);
  const linePattern = new RegExp(
    `^\\s*(.+?)\\s*[:：-]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(${UNIT_ALTERNATIVES})\\s*(?:(?:[x×*@]|سعر(?:\\s*الوحدة)?|unit\\s*price)\\s*)?|\\s*(?:[x×*@]|سعر(?:\\s*الوحدة)?|unit\\s*price)\\s*|\\s+)(\\d+(?:[.,]\\d+)?)\\s*(?:جنيه(?:ات)?|جنية|ج\\.م\\.?|egp|ج)?\\s*$`,
    'i',
  );

  // Split lines, and also expand comma-separated multi-item sentences when each segment clearly carries numbers
  const candidateLines: string[] = [];
  for (const rawLine of normalizedText.split(/\r?\n/)) {
    const trimmed = rawLine.trim().replace(/^\s*[•*]\s*/u, '');
    if (!trimmed) continue;
    if (trimmed.includes('،') || trimmed.includes(';')) {
      const segments = trimmed.split(/\s*[،;]\s*/u).map((s) => s.trim()).filter(Boolean);
      if (segments.length >= 2 && segments.every((seg) => /\d/.test(seg) && /[\p{L}]/u.test(seg))) {
        candidateLines.push(...segments);
        continue;
      }
    }
    candidateLines.push(trimmed);
  }

  candidateLines.forEach((line, index) => {
    const supplierMatch = line.match(/^(?:المورد|اسم\s*المورد|التاجر|شركة|مؤسسة|محل|supplier|vendor)\s*[:：]\s*(.+)$/iu);
    if (supplierMatch) {
      supplierName = supplierMatch[1].trim();
      return;
    }

    const invNumMatch = line.match(/^(?:رقم\s*الفاتورة|فاتورة\s*رقم|رقم\s*الإيصال|invoice\s*(?:no|#|number)?)\s*[:：#]?\s*([A-Za-z0-9\-/]+)$/iu);
    if (invNumMatch) {
      invoiceNumber = invNumMatch[1].trim();
      return;
    }

    const dateHeaderMatch = line.match(/^(?:التاريخ|تاريخ\s*الفاتورة|date)\s*[:：]?\s*(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})$/iu);
    if (dateHeaderMatch) {
      invoiceDate = normalizeParsedInvoiceDate(dateHeaderMatch[1]) ?? invoiceDate;
      return;
    }

    const discountMatch = line.match(/^(?:الخصم|خصم|discount)\s*[:：]?\s*(\d+(?:[.,]\d+)?)/iu);
    if (discountMatch) {
      const val = parseLocalizedNumber(discountMatch[1]);
      if (val !== null && val >= 0) discountAmount = val;
      return;
    }

    const taxMatch = line.match(/^(?:الضريبة|ضريبة|ض\.ق\.م|vat|tax)\s*[:：]?\s*(\d+(?:[.,]\d+)?)/iu);
    if (taxMatch) {
      const val = parseLocalizedNumber(taxMatch[1]);
      if (val !== null && val >= 0) taxAmount = val;
      return;
    }

    const payMatch = line.match(/^(?:طريقة\s*الدفع|الدفع|سداد|payment)\s*[:：]?\s*(.+)$/iu);
    if (payMatch) {
      const rawPay = payMatch[1];
      if (/(آجل|اجل|على\s*الحساب|ذمم|credit)/iu.test(rawPay)) paymentMethod = 'credit';
      else if (/(تحويل|بنك|انستا|فودافون\s*كاش|محفظة|transfer|instapay)/iu.test(rawPay)) paymentMethod = 'bank_transfer';
      else if (/(نقد|كاش|cash)/iu.test(rawPay)) paymentMethod = 'cash';
      return;
    }

    if (SKIP_PURCHASE_META_PATTERN.test(line)) {
      return;
    }

    // 1. Try structured pipe / 3-number / leading-multiplier invoice rows first
    const structured = parseStructuredInvoiceRow(line, index);
    if (structured) {
      const matched = matchCatalogItem(structured.sourceName, items);
      lines.push({
        ...structured,
        itemId: matched.id,
        matchConfidence: matched.confidence,
        category: 'other',
      });
      return;
    }

    // 2. Try standard "Name Qty [Unit] [x] UnitPrice"
    const strippedLine = stripLeadingRowSerial(line);
    const match = strippedLine.match(linePattern);
    const quantity = match ? parseLocalizedNumber(match[2]) : null;
    const unitPrice = match ? parseLocalizedNumber(match[4]) : null;
    const sourceName = match?.[1]?.trim().replace(/[:：-]\s*$/, '') ?? '';

    if (!match || !sourceName || !/[\p{L}]/u.test(sourceName) || quantity === null || quantity <= 0 || unitPrice === null || unitPrice < 0) {
      // 3. Free-form fallback: "اشتريت 3 جرجير سعر الواحده 3.5 جنيه و نص" / "5 كيلو طماطم الكيلو ب 30" / "نص كيلو ثوم ب 40"
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
        category: 'other',
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
      category: 'other',
    });
  });

  return {
    supplierName,
    ...(invoiceNumber ? { invoiceNumber } : {}),
    ...(invoiceDate ? { invoiceDate } : {}),
    ...(taxAmount !== undefined ? { taxAmount } : {}),
    ...(discountAmount !== undefined ? { discountAmount } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    lines,
    ignoredLines,
  };
}
