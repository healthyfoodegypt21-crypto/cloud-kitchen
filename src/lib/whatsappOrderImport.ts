import { compactWhitespace, getTodayDateValue } from '@/lib/utils';
import { normalizeDigitsInText } from '@/lib/smartPurchaseImport';

export type WhatsAppOrderRow = Record<string, string>;

export interface WhatsAppOrderCatalogContext {
  mealNames?: string[];
  packageNames?: string[];
  brandNames?: string[];
}

const PHONE_PATTERN = /(?:\+?20\s*|0020\s*)?0?1[0125](?:[\s.-]*\d){8}/u;
const URL_PATTERN = /https?:\/\/[^\s]+/iu;
const NUMBER_PATTERN = /(\d+(?:[.,]\d+)?)/u;
const ADDRESS_KEYWORDS =
  /(شارع|(?:^|\s)ش(?:\.|\s+)|عمار[هة]|برج|الدور|الطابق|شق[هة]|امام|أمام|بجوار|خلف|متفرع|فيل[اة]|كومبوند|كمبوند|ميدان|محور|طريق|اسانسير|أسانسير|عمارات|حي\s+|مساكن|تقسيم|امتداد|ناصي[ةه]|بواب[ةه])/u;
const PRICE_KEYWORDS = /(قيم[هة]|السعر|سعر|المبلغ|مبلغ|الإجمالي|اجمالي|الحساب|حساب|الصافي|المطلوب|تحصيل|total|price|amount)/iu;
const DELIVERY_KEYWORDS = /(توصيل|دليفري|ديليفري|شحن|delivery|shipping)/iu;
const FREE_DELIVERY_KEYWORDS = /(مجان[ياى]?|فري|بدون\s*(?:توصيل|شحن|مصاريف)|شامل\s*(?:التوصيل|الشحن)|free\s*delivery)/iu;
const PACKAGE_KEYWORDS = /(الاوردر|الأوردر|اوردر|الطلب|الباقة|باقة|الباكدج|باكدج|اشتراك|package|plan|order)/iu;
const PACKAGE_LABEL_PREFIX = /^(?:الاوردر|الأوردر|اوردر|الطلب|الباقة|باقة)\s*/u;
const SEPARATOR_PATTERN = /[:：/\-–—]/u;

const BRAND_SYNONYMS: Array<[RegExp, string]> = [
  [/(?:healthy\s*food|هيلثي\s*فود|هلثي\s*فود)/iu, 'Healthy Food'],
  [/(?:healthy\s*station|هيلثي\s*ستيشن|هلثي\s*ستيشن)/iu, 'Healthy Station'],
  [/(?:protein\s*box|بروتين\s*بوكس)/iu, 'Protein Box'],
];

type WorkingLine = { text: string; consumed: boolean };

function normalizeLookupText(value: string): string {
  return compactWhitespace(
    value
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/gu, '')
      .replace(/[أإآٱ]/gu, 'ا')
      .replace(/ة/gu, 'ه')
      .replace(/ى/gu, 'ي'),
  );
}

function addDaysToIsoDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function extractNaturalExecutionDate(lineText: string): string | null {
  const isoMatch = lineText.match(/\b(20\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const dmyMatch = lineText.match(/\b(\d{1,2})[/-](\d{1,2})[/-](20\d{2})\b/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  const norm = normalizeLookupText(lineText);
  if (/(?:التسليم|التنفيذ|توصيل\s*يوم|موعد|ميعاد)/u.test(norm) || /^(?:بكره|غدا|بعد\s*بكره|النهارده|اليوم)$/u.test(norm)) {
    const today = getTodayDateValue();
    if (/بعد\s*بكره/u.test(norm)) return addDaysToIsoDate(today, 2);
    if (/(?:بكره|غدا)/u.test(norm)) return addDaysToIsoDate(today, 1);
    if (/(?:النهارده|اليوم)/u.test(norm)) return today;
  }
  return null;
}

// Parses a free-form WhatsApp or handwritten order message by detecting each field
// from its shape + optional catalog meal/package/brand awareness.
export function parseWhatsAppOrder(
  value: string,
  context: WhatsAppOrderCatalogContext = {},
): WhatsAppOrderRow | null {
  const normalized = normalizeDigitsInText(value);
  const lines: WorkingLine[] = normalized
    .split(/\r?\n/u)
    .map((line) => ({
      text: compactWhitespace(line.replace(/^\s*[•▪▫◦]\s*/u, '- ')),
      consumed: false,
    }))
    .filter((line) => line.text.length > 0);

  if (lines.length === 0) {
    return null;
  }

  const normalizedMealCatalog = (context.mealNames ?? [])
    .map((name) => ({ raw: name, norm: normalizeLookupText(name) }))
    .filter((entry) => entry.norm.length >= 3);

  const normalizedPackageCatalog = (context.packageNames ?? [])
    .map((name) => ({ raw: name, norm: normalizeLookupText(name) }))
    .filter((entry) => entry.norm.length >= 3);

  const result = {
    name: '',
    phone: '',
    phoneSecondary: '',
    locationLink: '',
    brand: '',
    executionDate: '',
    region: '',
    address: '',
    packageName: '',
    meals: [] as string[],
    price: '',
    deliveryFee: '',
    notes: '',
  };

  const consume = (index: number) => {
    lines[index].consumed = true;
  };

  // 0. Location URL (Google Maps / Waze / URL) anywhere in message
  for (let index = 0; index < lines.length; index += 1) {
    const urlMatch = lines[index].text.match(URL_PATTERN);
    if (!urlMatch) continue;
    result.locationLink = urlMatch[0].replace(/[.,،)]+$/u, '');
    const remainder = compactWhitespace(
      lines[index].text
        .replace(urlMatch[0], '')
        .replace(/^(?:اللوكيشن|لوكيشن|الموقع|رابط\s*الموقع|location)\s*[:：\-/]?\s*/iu, ''),
    );
    consume(index);
    if (remainder && /[\p{L}\p{N}]/u.test(remainder)) {
      lines.splice(index + 1, 0, { text: remainder, consumed: false });
    }
    break;
  }

  // 0b. Brand detection (if explicitly written in message)
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const textLine = lines[index].text;
    const customBrand = (context.brandNames ?? []).find(
      (b) => normalizeLookupText(textLine) === normalizeLookupText(b),
    );
    if (customBrand) {
      result.brand = customBrand;
      consume(index);
      break;
    }
    const synBrand = BRAND_SYNONYMS.find(
      ([pattern]) => pattern.test(textLine) && textLine.split(' ').length <= 4 && !/\d/.test(textLine),
    );
    if (synBrand) {
      result.brand = synBrand[1];
      consume(index);
      break;
    }
  }

  // 0c. Execution date line if explicitly mentioned
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const dt = extractNaturalExecutionDate(lines[index].text);
    if (dt && lines[index].text.split(' ').length <= 5) {
      result.executionDate = dt;
      consume(index);
      break;
    }
  }

  // 1. Phone — may share its line with the customer name.
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const match = lines[index].text.match(PHONE_PATTERN);
    if (!match) continue;
    result.phone = match[0].replace(/[\s.-]+/g, '');
    const remainder = compactWhitespace(
      lines[index].text
        .replace(match[0], '')
        .replace(/^(?:موبايل|تليفون|تلفون|هاتف|رقم|للتواصل|phone|mob)\s*[:：\-/]?\s*/iu, ''),
    );
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
      result.phoneSecondary = match[0].replace(/[\s.-]+/g, '');
      const remainder = compactWhitespace(
        lines[index].text
          .replace(match[0], '')
          .replace(/^(?:بديل|رقم\s*اخر|رقم\s*تاني|هاتف\s*بديل)\s*[:：\-/]?\s*/iu, ''),
      );
      consume(index);
      if (remainder && /[\p{L}]/u.test(remainder)) {
        lines.splice(index + 1, 0, { text: remainder, consumed: false });
      }
      break;
    }
  }

  // 2. Price & Combined Price + Delivery (e.g. "1200 + 50 توصيل" or "1400 شامل التوصيل")
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const lineText = lines[index].text;

    const combinedPlusMatch = lineText.match(
      /(\d+(?:[.,]\d+)?)\s*(?:جنيه|ج\.م|ج)?\s*\+\s*(\d+(?:[.,]\d+)?)\s*(?:توصيل|دليفري|شحن|delivery)/iu,
    );
    if (combinedPlusMatch) {
      result.price = combinedPlusMatch[1].replace(',', '.');
      result.deliveryFee = combinedPlusMatch[2].replace(',', '.');
      consume(index);
      break;
    }

    if (!PRICE_KEYWORDS.test(lineText)) continue;
    // Skip if it's purely "توصيل / ..." without order price
    if (/^(?:توصيل|دليفري|رسوم\s*التوصيل|مصاريف\s*الشحن)/iu.test(lineText)) continue;
    const amount = lineText.match(NUMBER_PATTERN);
    if (!amount) continue;
    result.price = amount[1].replace(',', '.');
    if (FREE_DELIVERY_KEYWORDS.test(lineText) && !result.deliveryFee) {
      result.deliveryFee = '0';
    }
    consume(index);
    break;
  }

  // 3. Delivery fee — zero is a meaningful value (free delivery).
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || !DELIVERY_KEYWORDS.test(lines[index].text)) continue;
    if (FREE_DELIVERY_KEYWORDS.test(lines[index].text)) {
      result.deliveryFee = '0';
      consume(index);
      break;
    }
    const amount = lines[index].text.match(NUMBER_PATTERN);
    if (!amount) continue;
    result.deliveryFee = amount[1].replace(',', '.');
    consume(index);
    break;
  }

  // 4. Package / order type (keyword or catalog package match).
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const text = lines[index].text;
    const normLine = normalizeLookupText(text);
    const matchedCatalogPkg = normalizedPackageCatalog.find(
      (pkg) => normLine === pkg.norm || normLine.includes(pkg.norm),
    );

    if (!PACKAGE_KEYWORDS.test(text) && !matchedCatalogPkg) continue;

    const keywordMatch = text.match(PACKAGE_KEYWORDS);
    const separatorIndex = text.search(SEPARATOR_PATTERN);
    if (separatorIndex > 0 && keywordMatch && keywordMatch.index !== undefined && keywordMatch.index < separatorIndex) {
      result.packageName = compactWhitespace(text.slice(separatorIndex + 1));
    } else if (PACKAGE_LABEL_PREFIX.test(text)) {
      result.packageName = compactWhitespace(text.replace(PACKAGE_LABEL_PREFIX, ''));
    } else {
      result.packageName = matchedCatalogPkg?.raw ?? text;
    }
    consume(index);
    break;
  }

  // 5. Meal lines — supports:
  //   a) Leading quantity ("2 Beef Shawarma", "1 فراخ مشوية بدون رز")
  //   b) Trailing quantity ("Beef Shawarma x2", "شيش طاووق × 3", "فراخ مشوية عدد 2")
  //   c) Arabic dual ("وجبتين استيك")
  //   d) Bullet/hyphen items ("- Beef Shawarma") or catalog-matched meal names!
  const QUANTITY_WORDS: Record<string, number> = {
    واحد: 1, واحده: 1, واحدة: 1, وجبه: 1, وجبة: 1,
    اتنين: 2, اثنين: 2, وجبتين: 2,
    تلاته: 3, تلاتة: 3, ثلاثه: 3, ثلاثة: 3,
    اربعه: 4, اربعة: 4, أربعة: 4,
    خمسه: 5, خمسة: 5,
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed) continue;
    const rawLine = lines[index].text;
    if (ADDRESS_KEYWORDS.test(rawLine)) continue;

    // 5a. Leading numeric quantity: "1 Beef Shawarma" or "2x شيش طاووق"
    const leadQtyMatch = rawLine.match(/^(?:[-*]\s*)?(\d{1,2})\s*[x×*]?\s+(.+)$/iu);
    if (leadQtyMatch) {
      const quantity = Number(leadQtyMatch[1]);
      const mealName = compactWhitespace(leadQtyMatch[2]);
      if (Number.isFinite(quantity) && quantity > 0 && quantity <= 50 && /[\p{L}]/u.test(mealName)) {
        for (let c = 0; c < quantity; c += 1) result.meals.push(mealName);
        consume(index);
        continue;
      }
    }

    // 5b. Trailing numeric quantity: "Beef Shawarma x2" / "شيش طاووق × 3" / "فراخ عدد 2"
    const trailQtyMatch = rawLine.match(
      /^(?:[-*]\s*)?(.+?)\s*(?:[x×*]\s*(\d{1,2})|(?:عدد|كمية|العدد)\s*[:：]?\s*(\d{1,2}))$/iu,
    );
    if (trailQtyMatch) {
      const mealName = compactWhitespace(trailQtyMatch[1]);
      const quantity = Number(trailQtyMatch[2] ?? trailQtyMatch[3]);
      if (Number.isFinite(quantity) && quantity > 0 && quantity <= 50 && /[\p{L}]/u.test(mealName)) {
        for (let c = 0; c < quantity; c += 1) result.meals.push(mealName);
        consume(index);
        continue;
      }
    }

    // 5c. Arabic word quantity prefix: "وجبتين شيش طاووق" / "اتنين بيف شاورما"
    const wordQtyMatch = rawLine.match(
      /^(?:[-*]\s*)?(وجبتين|اتنين|اثنين|تلاته|تلاتة|ثلاثة|اربعه|اربعة|أربعة|خمسه|خمسة)\s+(?:وجبات\s+)?(.+)$/iu,
    );
    if (wordQtyMatch) {
      const qty = QUANTITY_WORDS[wordQtyMatch[1]] ?? 1;
      const mealName = compactWhitespace(wordQtyMatch[2]);
      if (/[\p{L}]/u.test(mealName)) {
        for (let c = 0; c < qty; c += 1) result.meals.push(mealName);
        consume(index);
        continue;
      }
    }

    // 5d. Bullet item "- Beef Shawarma" or exact/prefix match against known catalog meals
    const bulletStripped = rawLine.replace(/^[-*]\s+/u, '').trim();
    const isBullet = /^[-*]\s+/u.test(rawLine);
    const normCandidate = normalizeLookupText(bulletStripped.split(/\s+[—–-]\s+/u)[0] ?? bulletStripped);
    const matchesCatalogMeal =
      normCandidate.length >= 3 &&
      normalizedMealCatalog.some(
        (m) => m.norm === normCandidate || (normCandidate.length >= 5 && m.norm.includes(normCandidate)),
      );

    if ((isBullet && result.meals.length > 0) || matchesCatalogMeal) {
      result.meals.push(bulletStripped);
      consume(index);
    }
  }

  // 6. Address — unconsumed lines carrying location keywords, joined in order.
  const addressParts: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || !ADDRESS_KEYWORDS.test(lines[index].text)) continue;
    addressParts.push(
      compactWhitespace(lines[index].text.replace(/^(?:العنوان|عنوان)\s*[:：\-/]?\s*/iu, '')),
    );
    consume(index);
  }
  result.address = addressParts.join(' - ');

  // 6b. Fallback: the longest remaining line (beyond a name-length) is likely the address.
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

  // 7. Fallback standalone price at the end if price wasn't labeled with keyword (e.g. "1400 جنيه" alone on a line)
  if (!result.price) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      if (lines[index].consumed) continue;
      const barePrice = lines[index].text.match(/^(\d{2,5}(?:[.,]\d+)?)\s*(?:جنيه|جنية|ج\.م\.?|egp|ج)?$/iu);
      if (barePrice) {
        result.price = barePrice[1].replace(',', '.');
        consume(index);
        break;
      }
    }
  }

  // 8. Region — the short digit-free line right after the name candidate.
  const nameIndex = lines.findIndex((line) => !line.consumed);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].consumed || index === nameIndex) continue;
    const words = lines[index].text.split(' ').filter(Boolean);
    if (/\d/u.test(lines[index].text) || words.length > 4) continue;
    result.region = lines[index].text;
    consume(index);
    break;
  }

  // 9. Name — the first remaining line.
  const finalNameIndex = lines.findIndex((line) => !line.consumed);
  if (finalNameIndex >= 0) {
    result.name = compactWhitespace(
      lines[finalNameIndex].text.replace(/^(?:الاسم|اسم\s*العميل|العميل|استاذ|أستاذ|مدام|كابتن|دكتور)\s*[:：\-/]?\s*/iu, ''),
    );
    consume(finalNameIndex);
  }

  // 10. Anything left is treated as customer notes.
  result.notes = lines.filter((line) => !line.consumed).map((line) => line.text).join(' - ');

  const row: WhatsAppOrderRow = {};
  if (result.name) row['اسم العميل'] = result.name;
  if (result.phone) row['الهاتف'] = result.phone;
  if (result.phoneSecondary) row['هاتف بديل'] = result.phoneSecondary;
  if (result.locationLink) row['رابط الموقع'] = result.locationLink;
  if (result.brand) row['البراند'] = result.brand;
  if (result.executionDate) row['تاريخ التنفيذ'] = result.executionDate;
  if (result.region) row['المنطقة'] = result.region;
  if (result.address) row['العنوان'] = result.address;
  if (result.packageName) row['الباقة'] = result.packageName;
  if (result.meals.length > 0) row['التفاصيل'] = result.meals.join('، ');
  if (result.price) row['المبلغ'] = result.price;
  if (result.deliveryFee) row['التوصيل'] = result.deliveryFee;
  if (result.notes) row['ملاحظات'] = result.notes;

  return Object.keys(row).length > 0 ? row : null;
}
