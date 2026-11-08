import type { InventoryUnit } from '@/types/inventory';
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

const REMAINING_ALTERNATIVES = 'متبقي(?:ة)?|المتبقي(?:ة)?|الباقي|باقي|remaining|rem';

// "اسم الصنف 5 كجم متبقي 10" / "فراخ 2 - الباقي 8" / "بصل: 3، الباقي: 10"
const linePattern = new RegExp(
  `^\\s*(.+?)\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(${PURCHASE_UNIT_ALTERNATIVES}))?(?:\\s*(?:[-–—,،]\\s*)?(?:${REMAINING_ALTERNATIVES})\\s*[:：]?\\s*(\\d+(?:[.,]\\d+)?)(?:\\s*(?:${PURCHASE_UNIT_ALTERNATIVES}))?)?\\s*$`,
  'i',
);

const SKIP_LINE_PATTERN = /^(?:الإجمالي|اجمالي|المجموع|total|التاريخ|date|مسحوبات|المسحوبات|الصنف|الأصناف|الكمية|الكميه|ملاحظات|التوقيع|المسؤول|المسئول|المستلم|الوحدة|المتبقي)(?:\s|:|$)/iu;

export function parseWithdrawalSheetText(text: string, items: WithdrawalCatalogItem[]): WithdrawalImportResult {
  const lines: WithdrawalImportLine[] = [];
  const ignoredLines: string[] = [];
  const normalizedText = normalizeDigitsInText(text);

  normalizedText.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    if (SKIP_LINE_PATTERN.test(line)) {
      return;
    }

    const match = line.match(linePattern);
    const quantity = match ? parseLocalizedNumber(match[2]) : null;
    const remaining = match?.[4] ? parseLocalizedNumber(match[4]) : null;
    const sourceName = match?.[1]?.trim().replace(/[:：\-–—]\s*$/u, '') ?? '';

    if (!match || !sourceName || quantity === null || quantity <= 0) {
      ignoredLines.push(line);
      return;
    }

    const matched = matchCatalogItem(sourceName, items);
    lines.push({
      id: `withdrawal-${index}`,
      sourceName,
      itemId: matched.id,
      quantity,
      remainingQuantity: remaining !== null && remaining >= 0 ? remaining : null,
      sourceUnit: normalizePurchaseUnit(match[3]),
      matchConfidence: matched.confidence,
    });
  });

  return { lines, ignoredLines };
}
