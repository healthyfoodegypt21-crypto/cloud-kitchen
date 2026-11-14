import type { InventoryUnit } from '@/types/inventory';
import { compactWhitespace } from '@/lib/utils';
import {
  matchCatalogItem,
  normalizeDigitsInText,
  normalizePurchaseUnit,
  parseLocalizedNumber,
  PURCHASE_UNIT_ALTERNATIVES,
  type SmartPurchaseCatalogItem,
} from '@/lib/smartPurchaseImport';

export type WithdrawalCatalogItem = SmartPurchaseCatalogItem;

export type WithdrawalImportLine = {
  id: string;
  sourceName: string;
  itemId: string;
  quantity: number;
  remainingQuantity: number | null;
  sourceUnit: InventoryUnit | null;
  matchConfidence: number;
};

export type WithdrawalImportResult = {
  lines: WithdrawalImportLine[];
  ignoredLines: string[];
};

const REMAINING_ALTERNATIVES = 'متبقي(?:ة|ه)?|المتبقي(?:ة|ه)?|الباقي|باقي|رصيد\\s*متبقي|الموجود|فضلت?|فاضل|remaining|rem';

const FRACTION_MAP: Record<string, number> = {
  نص: 0.5,
  نصف: 0.5,
  ربع: 0.25,
  تلت: 1 / 3,
  ثلث: 1 / 3,
};

// Standard: "اسم الصنف 5 كجم متبقي 10" / "فراخ 2 - الباقي 8" / "بصل: 3، الباقي: 10"
const standardLinePattern = new RegExp(
  `^\\s*(.+?)\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*و\\s*(نص|نصف|ربع))?(?:\\s*(${PURCHASE_UNIT_ALTERNATIVES}))?(?:\\s*(?:[-–—,،|]\\s*)?(?:${REMAINING_ALTERNATIVES})\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(?:${PURCHASE_UNIT_ALTERNATIVES}))?)?\\s*$`,
  'iu',
);

// Printed/Handwritten WithdrawalSheetPrintSheet column order:
// "[م] | اسم الصنف | الوحدة | الكمية المسحوبة | [الرصيد الفعلي المتبقي]"
// e.g. "طماطم كجم 5 10" or "طماطم كجم 5"
const sheetUnitBeforeQtyPattern = new RegExp(
  `^\\s*([\\p{L}][^\\d|]+?)\\s+(${PURCHASE_UNIT_ALTERNATIVES})\\s+(\\d+(?:[.,]\\d+)?)(?:\\s+(?:(?:${REMAINING_ALTERNATIVES})\\s*[:：]?\\s*)?(\\d+(?:[.,]\\d+)?))?\\s*$`,
  'iu',
);

// Two trailing numbers without explicit "متبقي" from table OCR: "طماطم 5 10" or "طماطم 5 كجم 10"
const twoTrailingNumbersTablePattern = new RegExp(
  `^\\s*([\\p{L}][^\\d|]+?)\\s+(\\d+(?:[.,]\\d+)?)(?:\\s*(${PURCHASE_UNIT_ALTERNATIVES}))?\\s+(\\d+(?:[.,]\\d+)?)(?:\\s*(${PURCHASE_UNIT_ALTERNATIVES}))?\\s*$`,
  'iu',
);

// Leading quantity: "سحب 5 كجم طماطم متبقي 10" or "5 كيلو بصل الباقي 8"
const leadingQuantityPattern = new RegExp(
  `^\\s*(?:سحب|سحبت|سحبنا|صرف|خروج)?\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:و\\s*(نص|نصف|ربع)\\s*)?(?:(${PURCHASE_UNIT_ALTERNATIVES})\\s+)?([\\p{L}][^\\d,،|\\-–—]+?)(?:\\s*(?:[-–—,،|]\\s*)?(?:${REMAINING_ALTERNATIVES})\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(?:${PURCHASE_UNIT_ALTERNATIVES}))?)?\\s*$`,
  'iu',
);

// Colloquial fraction start: "نص كيلو فلفل أسود متبقي 2" / "ربع كجم كمون"
const fractionStartPattern = new RegExp(
  `^\\s*(?:سحب|سحبت)?\\s*(نص|نصف|ربع|تلت|ثلث)\\s+(${PURCHASE_UNIT_ALTERNATIVES})\\s+([\\p{L}][^\\d,،|\\-–—]+?)(?:\\s*(?:[-–—,،|]\\s*)?(?:${REMAINING_ALTERNATIVES})\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?))?\\s*$`,
  'iu',
);

const SKIP_LINE_PATTERN =
  /^(?:الإجمالي|اجمالي|المجموع|total|التاريخ|date|ورقة\s*مسحوبات|مسحوبات|المسحوبات|الصنف|اسم\s*الصنف|الأصناف|الكمية|الكميه|ملاحظات|التوقيع|توقيع|المسؤول|المسئول|المستلم|المراجعة|أمين\s*المخزن|امين\s*المخزن|شيف\s*المطبخ|المخزن\s*المركزي|يقوم\s*الموظف|الوحدة|المتبقي|م\s*(?:\|\s*)?اسم\s+الصنف)(?:\s|:|\||—|-|$)/iu;

function stripSheetRowIndex(line: string): string {
  // Strips leading row number from printed withdrawal sheet ("1 | طماطم ..." or "1 - طماطم" or "1 طماطم كجم 5")
  return line
    .replace(/^\s*\d{1,2}\s*(?:\||[.)\-–—])\s*(?=[\p{L}])/u, '')
    .replace(/^\s*\d{1,2}\s+(?=[\p{L}]{2,}\s+(?:\d|كجم|كيلو|جرام|جم|لتر|قطعة|قطعه|كيس|علبة|علبه|كرتونة|كرتون))/iu, '')
    .trim();
}

function parsePipeWithdrawalRow(
  rawLine: string,
): { sourceName: string; quantity: number; remainingQuantity: number | null; sourceUnit: InventoryUnit | null } | null {
  if (!rawLine.includes('|')) return null;
  const cells = rawLine
    .split('|')
    .map((c) => compactWhitespace(c))
    .filter(Boolean);

  if (cells.length < 2) return null;

  // Drop leading row serial cell ("1", "2", ..., "18") when followed by item name cell
  if (/^\d{1,2}$/.test(cells[0]) && cells[1] && /[\p{L}]/u.test(cells[1])) {
    cells.shift();
  }

  let sourceUnit: InventoryUnit | null = null;
  const numbers: number[] = [];
  const nameParts: string[] = [];

  for (const cell of cells) {
    const remMatch = cell.match(new RegExp(`^(?:${REMAINING_ALTERNATIVES})\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)`, 'iu'));
    if (remMatch) {
      const remVal = parseLocalizedNumber(remMatch[1]);
      if (remVal !== null) numbers.push(remVal);
      continue;
    }

    const unitOnly = normalizePurchaseUnit(cell);
    if (unitOnly) {
      sourceUnit = sourceUnit ?? unitOnly;
      continue;
    }

    const numWithUnit = cell.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${PURCHASE_UNIT_ALTERNATIVES})$`, 'iu'));
    if (numWithUnit) {
      const n = parseLocalizedNumber(numWithUnit[1]);
      if (n !== null) {
        numbers.push(n);
        sourceUnit = sourceUnit ?? normalizePurchaseUnit(numWithUnit[2]);
        continue;
      }
    }

    const numOnly = parseLocalizedNumber(cell);
    if (numOnly !== null && /^[\d.,]+$/.test(cell)) {
      numbers.push(numOnly);
      continue;
    }

    if (nameParts.length === 0 && /[\p{L}]/u.test(cell)) {
      nameParts.push(cell);
    }
  }

  const sourceName = compactWhitespace(nameParts.join(' '));
  if (!sourceName || numbers.length === 0 || numbers[0] <= 0) {
    return null;
  }

  return {
    sourceName,
    quantity: numbers[0],
    remainingQuantity: numbers.length >= 2 && numbers[1] >= 0 ? numbers[1] : null,
    sourceUnit,
  };
}

export function parseWithdrawalSheetText(text: string, items: WithdrawalCatalogItem[]): WithdrawalImportResult {
  const lines: WithdrawalImportLine[] = [];
  const ignoredLines: string[] = [];
  const normalizedText = normalizeDigitsInText(text);

  const candidateLines: string[] = [];
  for (const rawLine of normalizedText.split(/\r?\n/)) {
    const trimmed = rawLine.trim().replace(/^\s*[•*]\s*/u, '');
    if (!trimmed) continue;
    // Drop empty numbered form lines like "12" or "13 ......."
    if (/^\d{1,2}[\s._…\-|]*$/u.test(trimmed)) continue;

    // Split multi-item comma lines ONLY if comma is NOT introducing "الباقي / متبقي"
    if (
      (trimmed.includes('،') || trimmed.includes(';')) &&
      !new RegExp(`[،;]\\s*(?:${REMAINING_ALTERNATIVES})`, 'iu').test(trimmed)
    ) {
      const segments = trimmed.split(/\s*[،;]\s*/u).map((s) => s.trim()).filter(Boolean);
      if (segments.length >= 2 && segments.every((s) => /\d/.test(s) && /[\p{L}]/u.test(s))) {
        candidateLines.push(...segments);
        continue;
      }
    }
    candidateLines.push(trimmed);
  }

  candidateLines.forEach((rawCandidate, index) => {
    if (SKIP_LINE_PATTERN.test(rawCandidate)) {
      return;
    }

    const pushParsed = (
      sourceName: string,
      quantity: number,
      remainingQuantity: number | null,
      sourceUnit: InventoryUnit | null,
    ) => {
      const cleanName = compactWhitespace(
        sourceName
          .replace(/^(?:سحب|سحبت|سحبنا|صرف)\s+/iu, '')
          .replace(/[:：\-–—]\s*$/u, ''),
      );
      const matched = matchCatalogItem(cleanName, items);
      lines.push({
        id: `withdrawal-${index}`,
        sourceName: cleanName,
        itemId: matched.id,
        quantity,
        remainingQuantity: remainingQuantity !== null && remainingQuantity >= 0 ? remainingQuantity : null,
        sourceUnit,
        matchConfidence: matched.confidence,
      });
    };

    // 1. Pipe-separated table row ("1 | طماطم | كجم | 5 | 10")
    const pipeRow = parsePipeWithdrawalRow(rawCandidate);
    if (pipeRow) {
      pushParsed(pipeRow.sourceName, pipeRow.quantity, pipeRow.remainingQuantity, pipeRow.sourceUnit);
      return;
    }

    const line = stripSheetRowIndex(rawCandidate);
    if (!line || SKIP_LINE_PATTERN.test(line)) {
      return;
    }

    // 2. Printed sheet order: "طماطم كجم 5 10" or "طماطم كجم 5"
    const unitFirstMatch = line.match(sheetUnitBeforeQtyPattern);
    if (unitFirstMatch) {
      const qty = parseLocalizedNumber(unitFirstMatch[3]);
      const rem = unitFirstMatch[4] ? parseLocalizedNumber(unitFirstMatch[4]) : null;
      if (qty !== null && qty > 0) {
        pushParsed(unitFirstMatch[1], qty, rem, normalizePurchaseUnit(unitFirstMatch[2]));
        return;
      }
    }

    // 3. Colloquial fraction start: "نص كيلو فلفل أسود متبقي 2"
    const fracStart = line.match(fractionStartPattern);
    if (fracStart) {
      const qty = FRACTION_MAP[fracStart[1]] ?? null;
      const rem = fracStart[4] ? parseLocalizedNumber(fracStart[4]) : null;
      if (qty !== null && qty > 0) {
        pushParsed(fracStart[3], qty, rem, normalizePurchaseUnit(fracStart[2]));
        return;
      }
    }

    // 4. Leading quantity: "5 كجم طماطم متبقي 10" / "سحب 2 و نص كجم طماطم متبقي 7.5"
    const leadQty = line.match(leadingQuantityPattern);
    if (leadQty) {
      const baseQty = parseLocalizedNumber(leadQty[1]);
      const frac = leadQty[2] ? FRACTION_MAP[leadQty[2]] ?? 0 : 0;
      const qty = baseQty !== null ? baseQty + frac : null;
      const rem = leadQty[5] ? parseLocalizedNumber(leadQty[5]) : null;
      if (qty !== null && qty > 0 && leadQty[4]) {
        pushParsed(leadQty[4], qty, rem, normalizePurchaseUnit(leadQty[3]));
        return;
      }
    }

    // 5. Two trailing numbers from table OCR without "متبقي": "طماطم 5 10" or "طماطم 5 كجم 10"
    const twoNumMatch = line.match(twoTrailingNumbersTablePattern);
    if (twoNumMatch) {
      const qty = parseLocalizedNumber(twoNumMatch[2]);
      const rem = parseLocalizedNumber(twoNumMatch[4]);
      const unit = normalizePurchaseUnit(twoNumMatch[3] ?? twoNumMatch[5]);
      if (qty !== null && qty > 0) {
        pushParsed(twoNumMatch[1], qty, rem, unit);
        return;
      }
    }

    // 6. Standard: "طماطم 5 كجم متبقي 10" / "فراخ 2 - الباقي 8"
    const stdMatch = line.match(standardLinePattern);
    if (stdMatch) {
      const baseQty = parseLocalizedNumber(stdMatch[2]);
      const frac = stdMatch[3] ? FRACTION_MAP[stdMatch[3]] ?? 0 : 0;
      const qty = baseQty !== null ? baseQty + frac : null;
      const rem = stdMatch[5] ? parseLocalizedNumber(stdMatch[5]) : null;
      const srcName = stdMatch[1]?.trim().replace(/[:：\-–—]\s*$/u, '') ?? '';
      if (srcName && /[\p{L}]/u.test(srcName) && qty !== null && qty > 0) {
        pushParsed(srcName, qty, rem, normalizePurchaseUnit(stdMatch[4]));
        return;
      }
    }

    ignoredLines.push(rawCandidate);
  });

  return { lines, ignoredLines };
}
