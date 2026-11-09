import { compactWhitespace } from '@/lib/utils';
import { normalizeDigitsInText } from '@/lib/smartPurchaseImport';

export type WhatsAppOrderRow = Record<string, string>;

const PHONE_PATTERN = /(?:\+?20\s*|0020\s*)?0?1[0125](?:[\s-]*\d){8}/u;
const NUMBER_PATTERN = /(\d+(?:[.,]\d+)?)/u;
const ADDRESS_KEYWORDS = /(شارع|عمار[هة]|برج|الدور|شق[هة]|امام|أمام|بجوار|خلف|متفرع|فيل[اة]|كومبوند|كمبوند|ميدان|محور|طريق|اسانسير|أسانسير|عمارات)/u;
const PRICE_KEYWORDS = /(قيم[هة]|السعر|المبلغ|الإجمالي|اجمالي|الحساب|الصافي|total|price)/iu;
const DELIVERY_KEYWORDS = /(توصيل|دليفري|شحن|delivery)/iu;
const PACKAGE_KEYWORDS = /(الاوردر|الأوردر|الطلب|الباقة|الباكدج|باكدج|package|order)/iu;
const PACKAGE_LABEL_PREFIX = /^(?:الاوردر|الأوردر|الطلب|الباقة)\s+/u;
const SEPARATOR_PATTERN = /[:：/\-–—]/u;

type WorkingLine = { text: string; consumed: boolean };

// Parses a free-form WhatsApp order message (no "label: value" structure) by
// detecting each field from its shape: phone by pattern, price/delivery by
// keywords, meals by leading quantities, address by location keywords, region
// as the short line after the phone, and the name as the first remaining line.
export function parseWhatsAppOrder(value: string): WhatsAppOrderRow | null {
  const normalized = normalizeDigitsInText(value);
  const lines: WorkingLine[] = normalized
    .split(/\r?\n/u)
    .map((line) => ({ text: compactWhitespace(line), consumed: false }))
    .filter((line) => line.text.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const result = {
    name: '',
    phone: '',
    phoneSecondary: '',
    region: '',
    address: '',
    packageName: '',
    meals: [] as string[],
    price: '',
    deliveryFee: '',
    notes: '',
  };

  const consume = (index: number) => { lines[index].consumed = true; };

  // 1. Phone — may share its line with the customer name.
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].text.match(PHONE_PATTERN);
    if (!match) continue;
    result.phone = match[0];
    const remainder = compactWhitespace(lines[index].text.replace(match[0], ''));
    consume(index);
    if (remainder && /[\p{L}]/u.test(remainder)) {
      lines.splice(index + 1, 0, { text: remainder, consumed: false });
    }
    break;
  }

  // 1b. A second phone number becomes the alternate contact.
  if (result.phone) {
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].consumed) continue;
      const match = lines[index].text.match(PHONE_PATTERN);
      if (!match) continue;
      result.phoneSecondary = match[0];
      const remainder = compactWhitespace(lines[index].text.replace(match[0], ''));
      consume(index);
      if (remainder && /[\p{L}]/u.test(remainder)) {
        lines.splice(index + 1, 0, { text: remainder, consumed: false });
      }
      break;
    }
  }

  // 2. Price — checked before the package line because "قيمة الاوردر" contains
  // the package keyword too.
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || !PRICE_KEYWORDS.test(lines[index].text)) continue;
    const amount = lines[index].text.match(NUMBER_PATTERN);
    if (!amount) continue;
    result.price = amount[1];
    consume(index);
    break;
  }

  // 3. Delivery fee — zero is a meaningful value (free delivery).
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || !DELIVERY_KEYWORDS.test(lines[index].text)) continue;
    const amount = lines[index].text.match(NUMBER_PATTERN);
    if (!amount) continue;
    result.deliveryFee = amount[1];
    consume(index);
    break;
  }

  // 4. Package / order type.
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || !PACKAGE_KEYWORDS.test(lines[index].text)) continue;
    const text = lines[index].text;
    const keywordMatch = text.match(PACKAGE_KEYWORDS);
    const separatorIndex = text.search(SEPARATOR_PATTERN);
    if (separatorIndex > 0 && keywordMatch && keywordMatch.index !== undefined && keywordMatch.index < separatorIndex) {
      result.packageName = compactWhitespace(text.slice(separatorIndex + 1));
    } else if (PACKAGE_LABEL_PREFIX.test(text)) {
      result.packageName = compactWhitespace(text.replace(PACKAGE_LABEL_PREFIX, ''));
    } else {
      result.packageName = text;
    }
    consume(index);
    break;
  }

  // 5. Meal lines — a small leading quantity followed by the meal name.
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const mealMatch = lines[index].text.match(/^(\d{1,2})\s+(.+)$/u);
    if (!mealMatch) continue;
    const quantity = Number(mealMatch[1]);
    const mealName = compactWhitespace(mealMatch[2]);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 50) continue;
    if (ADDRESS_KEYWORDS.test(mealName)) continue;
    if (!/[\p{L}]/u.test(mealName)) continue;
    for (let count = 0; count < quantity; count += 1) {
      result.meals.push(mealName);
    }
    consume(index);
  }

  // 6. Address — unconsumed lines carrying location keywords, joined in order.
  const addressParts: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || !ADDRESS_KEYWORDS.test(lines[index].text)) continue;
    addressParts.push(lines[index].text);
    consume(index);
  }
  result.address = addressParts.join(' - ');

  // 6b. Fallback: the longest remaining line (beyond a name-length) is likely
  // the address even without keywords.
  if (!result.address) {
    let longestIndex = -1;
    let longestLength = 0;
    lines.forEach((line, index) => {
      if (line.consumed) return;
      if (line.text.length > longestLength) {
        longestLength = line.text.length;
        longestIndex = index;
      }
    });
    const firstFree = lines.findIndex((line) => !line.consumed);
    if (longestIndex >= 0 && longestIndex !== firstFree && longestLength > 30) {
      result.address = lines[longestIndex].text;
      consume(longestIndex);
    }
  }

  // 7. Region — the short digit-free line right after the name candidate.
  const nameIndex = lines.findIndex((line) => !line.consumed);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || index === nameIndex) continue;
    const words = lines[index].text.split(' ').filter(Boolean);
    if (/\d/u.test(lines[index].text) || words.length > 4) continue;
    result.region = lines[index].text;
    consume(index);
    break;
  }

  // 8. Name — the first remaining line.
  const finalNameIndex = lines.findIndex((line) => !line.consumed);
  if (finalNameIndex >= 0) {
    result.name = lines[finalNameIndex].text;
    consume(finalNameIndex);
  }

  // 9. Anything left is treated as customer notes.
  result.notes = lines.filter((line) => !line.consumed).map((line) => line.text).join(' - ');

  const row: WhatsAppOrderRow = {};
  if (result.name) row['اسم العميل'] = result.name;
  if (result.phone) row['الهاتف'] = result.phone;
  if (result.phoneSecondary) row['هاتف بديل'] = result.phoneSecondary;
  if (result.region) row['المنطقة'] = result.region;
  if (result.address) row['العنوان'] = result.address;
  if (result.packageName) row['الباقة'] = result.packageName;
  if (result.meals.length > 0) row['التفاصيل'] = result.meals.join('، ');
  if (result.price) row['المبلغ'] = result.price;
  if (result.deliveryFee) row['التوصيل'] = result.deliveryFee;
  if (result.notes) row['ملاحظات'] = result.notes;

  return Object.keys(row).length > 0 ? row : null;
}
