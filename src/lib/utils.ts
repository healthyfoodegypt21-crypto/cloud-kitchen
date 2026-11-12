import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { OrderMealCustomization, OrderMealSnapshotItem } from '@/types/order';

const egpCurrencyFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const arabicWeekdayFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  weekday: "long",
});

const arabicDateFormatter = new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function toLocalDate(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`);
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatEGPCurrency(value: number) {
  const safeValue = Number.isFinite(value) ? Math.round(value) : 0;
  const normalized = Object.is(safeValue, -0) ? 0 : safeValue;
  return `${egpCurrencyFormatter.format(normalized)} ج.م.`;
}

export function getTodayDateValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidDateValue(dateValue: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return false;
  }

  const date = toLocalDate(dateValue);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

export function getArabicWeekday(dateValue: string) {
  if (!isValidDateValue(dateValue)) {
    return "";
  }

  return arabicWeekdayFormatter.format(toLocalDate(dateValue));
}

export function formatArabicDate(dateValue: string) {
  if (!isValidDateValue(dateValue)) {
    return dateValue;
  }

  return arabicDateFormatter.format(toLocalDate(dateValue));
}

export function isDateMatchingWeekday(dateValue: string, weekday: string) {
  return isValidDateValue(dateValue) && getArabicWeekday(dateValue) === weekday;
}

export function compactWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function hasDetailedAddressParts(parts: {
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
}) {
  return [
    parts.address_house_number,
    parts.address_street,
    parts.address_area,
    parts.address_floor,
    parts.address_apartment,
  ].every(part => compactWhitespace(part).length > 0);
}

export function parseDetailedAddress(address: string) {
  const normalizedAddress = compactWhitespace(address);
  const fallback = {
    address_house_number: "",
    address_street: "",
    address_area: "",
    address_floor: "",
    address_apartment: "",
  };

  if (!normalizedAddress) {
    return fallback;
  }

  const match = normalizedAddress.match(/^بيت\s+(.+?)\s+-\s+شارع\s+(.+?)\s+-\s+منطقة\s+(.+?)\s+-\s+الدور\s+(.+?)\s+-\s+شقة\s+(.+)$/);
  if (match) {
    return {
      address_house_number: match[1],
      address_street: match[2],
      address_area: match[3],
      address_floor: match[4],
      address_apartment: match[5],
    };
  }

  return fallback;
}

export function extractLegacyOrderMetadata(notes: string | null) {
  if (!notes) {
    return {
      notes: "",
      phoneSecondary: "",
      executionDate: "",
      locationLink: "",
      mealCustomizations: [] as OrderMealCustomization[],
      packageMealSnapshot: [] as OrderMealSnapshotItem[],
      customerAmount: null as number | null,
      deliveryFee: null as number | null,
      importedMealDetails: [] as string[],
    };
  }

  const lines = notes.split("\n");
  const remainingLines: string[] = [];
  let phoneSecondary = "";
  let executionDate = "";
  let locationLink = "";
  let mealCustomizations: OrderMealCustomization[] = [];
  let packageMealSnapshot: OrderMealSnapshotItem[] = [];
  let customerAmount: number | null = null;
  let deliveryFee: number | null = null;
  let importedMealDetails: string[] = [];

  for (const line of lines) {
    if (line.startsWith("رقم بديل:")) {
      phoneSecondary = line.replace("رقم بديل:", "").trim();
    } else if (line.startsWith("تاريخ التنفيذ:")) {
      executionDate = line.replace("تاريخ التنفيذ:", "").trim();
    } else if (line.startsWith("رابط الموقع:")) {
      locationLink = line.replace("رابط الموقع:", "").trim();
    } else if (line.startsWith("تخصيصات الوجبات:")) {
      const rawValue = line.replace("تخصيصات الوجبات:", "").trim();

      try {
        const parsed = JSON.parse(rawValue) as OrderMealCustomization[];
        mealCustomizations = Array.isArray(parsed)
          ? parsed
              .filter((item) => item && typeof item.key === 'string' && typeof item.label === 'string' && typeof item.notes === 'string')
              .map((item) => ({
                key: compactWhitespace(item.key),
                label: compactWhitespace(item.label),
                notes: compactWhitespace(item.notes),
              }))
              .filter(item => item.key && item.label && item.notes)
          : [];
      } catch {
        mealCustomizations = [];
      }
    } else if (line.startsWith("وجبات الباقة:")) {
      const rawValue = line.replace("وجبات الباقة:", "").trim();

      try {
        const parsed = JSON.parse(rawValue) as OrderMealSnapshotItem[];
        packageMealSnapshot = Array.isArray(parsed)
          ? parsed
              .filter((item) => item && typeof item.key === 'string' && typeof item.label === 'string')
              .map((item) => ({
                key: compactWhitespace(item.key),
                label: compactWhitespace(item.label),
                category: typeof item.category === 'string' ? item.category : null,
              }))
              .filter(item => item.key && item.label)
          : [];
      } catch {
        packageMealSnapshot = [];
      }
    } else if (line.startsWith("حساب العميل:")) {
      const parsed = Number(line.replace("حساب العميل:", "").trim());
      customerAmount = Number.isFinite(parsed) ? parsed : null;
    } else if (line.startsWith("حساب التوصيل:")) {
      const parsed = Number(line.replace("حساب التوصيل:", "").trim());
      deliveryFee = Number.isFinite(parsed) ? parsed : null;
    } else if (/^تفاصيل\s*الشيت\s*:/u.test(line)) {
      importedMealDetails = line.replace(/^تفاصيل\s*الشيت\s*:/u, "").split(" | ").map(item => compactWhitespace(item)).filter(Boolean);
    } else if (line.trim()) {
      remainingLines.push(line);
    }
  }

  return {
    notes: remainingLines.join("\n"),
    phoneSecondary,
    executionDate,
    locationLink,
    mealCustomizations,
    packageMealSnapshot,
    ...(customerAmount !== null ? { customerAmount } : {}),
    ...(deliveryFee !== null ? { deliveryFee } : {}),
    ...(importedMealDetails.length > 0 ? { importedMealDetails } : {}),
  };
}

export function buildOrderNotesWithMetadata(input: {
  notes?: string;
  phoneSecondary?: string;
  executionDate?: string;
  locationLink?: string;
  mealCustomizations?: OrderMealCustomization[];
  packageMealSnapshot?: OrderMealSnapshotItem[];
  customerAmount?: number;
  deliveryFee?: number;
  importedMealDetails?: string[];
}) {
  const mealCustomizations = (input.mealCustomizations ?? [])
    .map((item) => ({
      key: compactWhitespace(item.key),
      label: compactWhitespace(item.label),
      notes: compactWhitespace(item.notes),
    }))
    .filter(item => item.key && item.label && item.notes);

  const packageMealSnapshot = (input.packageMealSnapshot ?? [])
    .map((item) => ({
      key: compactWhitespace(item.key),
      label: compactWhitespace(item.label),
      category: item.category ?? null,
    }))
    .filter(item => item.key && item.label);

  return [
    compactWhitespace(input.notes ?? ''),
    input.phoneSecondary ? `رقم بديل: ${input.phoneSecondary}` : '',
    input.executionDate ? `تاريخ التنفيذ: ${input.executionDate}` : '',
    input.locationLink ? `رابط الموقع: ${input.locationLink}` : '',
    mealCustomizations.length > 0 ? `تخصيصات الوجبات: ${JSON.stringify(mealCustomizations)}` : '',
    packageMealSnapshot.length > 0 ? `وجبات الباقة: ${JSON.stringify(packageMealSnapshot)}` : '',
    input.customerAmount !== undefined ? `حساب العميل: ${input.customerAmount}` : '',
    input.deliveryFee !== undefined ? `حساب التوصيل: ${input.deliveryFee}` : '',
    input.importedMealDetails && input.importedMealDetails.length > 0 ? `تفاصيل الشيت: ${input.importedMealDetails.join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

export function normalizeLocationLink(value: string) {
  const compactValue = compactWhitespace(value);
  if (!compactValue) {
    return '';
  }

  if (compactValue.startsWith('geo:')) {
    return compactValue;
  }

  if (/^[a-z]+:\/\//i.test(compactValue)) {
    return compactValue;
  }

  if (/^(maps\.app\.goo\.gl|goo\.gl|waze\.com|www\.waze\.com|ul\.waze\.com|maps\.apple\.com|google\.[^/]+|www\.google\.[^/]+)/i.test(compactValue)) {
    return `https://${compactValue}`;
  }

  return compactValue;
}

export function isSupportedLocationLink(value: string) {
  const normalizedValue = normalizeLocationLink(value);
  if (!normalizedValue) {
    return true;
  }

  if (normalizedValue.startsWith('geo:')) {
    return true;
  }

  try {
    const url = new URL(normalizedValue);
    const hostname = url.hostname.toLowerCase();

    return hostname === 'maps.app.goo.gl'
      || hostname === 'goo.gl'
      || hostname.endsWith('.google.com')
      || hostname.startsWith('google.')
      || hostname === 'maps.apple.com'
      || hostname === 'waze.com'
      || hostname === 'www.waze.com'
      || hostname === 'ul.waze.com';
  } catch {
    return false;
  }
}

export function buildDetailedAddressSearchQuery(parts: {
  address_house_number?: string;
  address_street?: string;
  address_area?: string;
  address_floor?: string;
  address_apartment?: string;
  address?: string;
}) {
  const houseNumber = compactWhitespace(parts.address_house_number ?? '');
  const street = compactWhitespace(parts.address_street ?? '');
  const area = compactWhitespace(parts.address_area ?? '');
  const floor = compactWhitespace(parts.address_floor ?? '');
  const apartment = compactWhitespace(parts.address_apartment ?? '');
  const fallbackAddress = compactWhitespace(parts.address ?? '');

  const detailedQuery = [
    houseNumber ? `بيت ${houseNumber}` : '',
    street ? `شارع ${street}` : '',
    area ? `منطقة ${area}` : '',
    floor ? `الدور ${floor}` : '',
    apartment ? `شقة ${apartment}` : '',
    'مصر',
  ].filter(Boolean).join('، ');

  if (street || area) {
    return detailedQuery;
  }

  if (fallbackAddress) {
    return [fallbackAddress, 'مصر'].filter(Boolean).join('، ');
  }

  return 'مصر';
}

export function buildOrderLocationUrl(order: {
  location_link?: string;
  address_house_number?: string;
  address_street?: string;
  address_area?: string;
  address?: string;
}) {
  const preciseLocationLink = normalizeLocationLink(order.location_link ?? '');
  if (preciseLocationLink) {
    return preciseLocationLink;
  }

  const query = buildDetailedAddressSearchQuery(order);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function formatDetailedAddress(parts: {
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
}) {
  return [
    `بيت ${compactWhitespace(parts.address_house_number)}`,
    `شارع ${compactWhitespace(parts.address_street)}`,
    `منطقة ${compactWhitespace(parts.address_area)}`,
    `الدور ${compactWhitespace(parts.address_floor)}`,
    `شقة ${compactWhitespace(parts.address_apartment)}`,
  ].join(' - ');
}
