import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DatePicker } from '@/components/ui/date-picker';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, ClipboardPaste, FileImage, FileSpreadsheet, Loader2, ScanLine, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from '@/hooks/useBrands';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuth } from '@/hooks/useAuth';
import { hasPageAccess } from '@/lib/permissions';
import { Meal, PackagePlan } from '@/types/menu';
import { Order, OrderMode, OrderSource, OrderStatus } from '@/types/order';
import { compactWhitespace, getTodayDateValue, isValidDateValue, normalizePhone } from '@/lib/utils';
import { getImportedOrderNumber } from '@/lib/orderImport';
import { extractImageFromClipboardEvent, smartReadImage } from '@/lib/ocrImage';
import { parseWhatsAppOrder, type WhatsAppOrderCatalogContext } from '@/lib/whatsappOrderImport';
import AiVisionStatusControl from '@/components/AiVisionStatusControl';

type ImportTarget = 'orders' | 'customers';
type ImportMethod = 'excel' | 'text' | 'image';
type ExcelRow = Record<string, unknown>;
type SaveImportedOrderResult = 'imported' | 'duplicate' | 'failed';

type Props = {
  saveImportedOrder: (order: Omit<Order, 'id' | 'created_at'>) => Promise<SaveImportedOrderResult>;
  onImported: () => void;
  brands: Brand[];
  meals: Meal[];
  packages: PackagePlan[];
};

const aliases = {
  orderNumber: ['رقم الطلب', 'رقم الاوردر', 'order number', 'order_number', 'id', 'الاوردر', 'الأوردر', 'اوردر'],
  name: ['اسم العميل', 'العميل', 'الاسم', 'name', 'customer name', 'customer_name'],
  phone: ['الهاتف', 'رقم الهاتف', 'التليفون', 'التلفون', 'رقم التلفون', 'رقم التليفون', 'الموبايل', 'الرقم', 'phone', 'mobile'],
  phoneSecondary: ['هاتف بديل', 'تليفون بديل', 'تلفون بديل', 'رقم بديل', 'phone secondary', 'phone_secondary'],
  address: ['العنوان', 'عنوان العميل', 'address'],
  locationLink: ['رابط الموقع', 'لوكيشن', 'الموقع', 'location link', 'location_link', 'map link'],
  brand: ['البراند', 'العلامة', 'brand', 'brand name', 'brand_id'],
  date: ['تاريخ التنفيذ', 'تاريخ الطلب', 'execution date', 'execution_date', 'date'],
  package: ['الباقة', 'اسم الباقة', 'الاوردر', 'الأوردر', 'اوردر', 'package', 'package name', 'package_plan_id'],
  meals: ['التفاصيل', 'تفاصيل الطلب', 'الوجبات', 'الوجبة', 'الأصناف', 'الطلب', 'details', 'meals', 'meal', 'selected_meal_ids'],
  quantity: ['العدد', 'الكميه', 'الكمية', 'عدد', 'كميه', 'كمية', 'quantity', 'qty', 'count'],
  mode: ['نوع الطلب', 'order mode', 'order_mode'],
  region: ['المنطقة', 'الحي', 'region', 'area'],
  mealType: ['نوع اليوم', 'meal type', 'meal_type'],
  price: ['السعر', 'الإجمالي', 'price', 'total'],
  customerAmount: ['المبلغ', 'حساب العميل', 'قيمة الطلب', 'customer amount', 'customer_amount'],
  deliveryFee: ['التوصيل', 'حساب التوصيل', 'رسوم التوصيل', 'delivery', 'delivery fee', 'delivery_fee'],
  status: ['الحالة', 'status'],
  source: ['المصدر', 'source'],
  notes: ['ملاحظات', 'notes', 'note'],
};

type ImportRow = ExcelRow & { __sourceRow?: number; __mealItems?: string[] };

function isPlaceholderCustomerRow(name: string, rawPhone: unknown) {
  const phoneText = text(rawPhone);
  if (/^(?:الاسم|اسم)\s*\d+$/u.test(name) || /^(?:الرقم|رقم)\s*\d+$/u.test(phoneText)) {
    return true;
  }
  return /^[\s._…-]+$/u.test(name) && /^[\s._…-]+$/u.test(phoneText);
}

function isPlaceholderMealText(value: string) {
  const trimmed = compactWhitespace(value);
  if (!trimmed) return true;
  return /^(?:[\s._…-]+|الوجب[ةه]\s*\d+|الإجمالي|الاجمالي|total)$/iu.test(trimmed);
}

export function parseImportedQuantity(value: unknown) {
  const normalized = normalizeArabicDigits(text(value)).replace(/[^\d.-]/g, '');
  if (!normalized) return 1;
  const parsed = Math.floor(Number(normalized));
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, 100);
}

export function formatImportedMealCell(rawValue: unknown, quantityValue?: unknown): string[] {
  if (rawValue === null || rawValue === undefined) return [];
  const rawString = String(rawValue).trim();
  if (!rawString || isPlaceholderMealText(rawString)) return [];

  const lines = rawString
    .split(/\r?\n/u)
    .map(line => compactWhitespace(line))
    .filter(line => line && !isPlaceholderMealText(line));

  if (lines.length === 0) return [];

  const quantity = parseImportedQuantity(quantityValue);

  if (lines.length > 1) {
    const mealName = lines[0].replace(/^\*+\s*/u, '').trim();
    const comment = lines.slice(1).join(' - ');
    if (!mealName) return [];
    const entry = comment ? `${mealName} — ${comment}` : mealName;
    return Array.from({ length: quantity }, () => entry);
  }

  const singleLine = lines[0];
  const splitItems = singleLine
    .split(/\s*[،|;]\s*|\s*,(?!\d)\s*/u)
    .map(item => compactWhitespace(item.replace(/^\*+\s*/u, '')))
    .filter(item => item && !isPlaceholderMealText(item));

  if (splitItems.length === 0) return [];
  if (splitItems.length === 1) {
    return Array.from({ length: quantity }, () => splitItems[0]);
  }
  return splitItems;
}

export function consolidateRows(rows: ExcelRow[]) {
  const consolidated: ImportRow[] = [];
  let current: ImportRow | null = null;

  rows.forEach((row, index) => {
    const rawName = text(cell(row, aliases.name));
    const rawPhone = cell(row, aliases.phone);
    const hasCustomerIdentity = Boolean(rawName || text(rawPhone));

    if (hasCustomerIdentity) {
      if (current) consolidated.push(current);
      if (isPlaceholderCustomerRow(rawName, rawPhone)) {
        current = null;
        return;
      }
      const initialMeals = formatImportedMealCell(cell(row, aliases.meals), cell(row, aliases.quantity));
      current = {
        ...row,
        ...(initialMeals.length > 0 ? { التفاصيل: initialMeals.join('، ') } : {}),
        __mealItems: initialMeals,
        __sourceRow: index + 2,
      };
      return;
    }

    if (!current) return;
    const moreMeals = formatImportedMealCell(cell(row, aliases.meals), cell(row, aliases.quantity));
    if (moreMeals.length > 0) {
      const nextMealItems = [...(current.__mealItems ?? []), ...moreMeals];
      current = {
        ...current,
        التفاصيل: nextMealItems.join('، '),
        __mealItems: nextMealItems,
      };
    }
  });

  if (current) consolidated.push(current);
  return consolidated;
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[\s_-]+/g, '')
    .replace(/[؟?،,:؛()./\\]/g, '');
}

export function cell(row: ExcelRow, keys: string[]) {
  const entries = Object.entries(row);
  let fallbackMatch: unknown = undefined;

  for (const alias of keys) {
    const normalizedAlias = normalizeHeader(alias);
    const match = entries.find(([key]) => normalizeHeader(key) === normalizedAlias);
    if (!match) continue;
    if (fallbackMatch === undefined) {
      fallbackMatch = match[1];
    }
    if (text(match[1]) !== '') {
      return match[1];
    }
  }

  return fallbackMatch;
}

function text(value: unknown) {
  return value === null || value === undefined ? '' : compactWhitespace(String(value));
}

export function normalizeImportedPhone(value: unknown) {
  const normalizedText = normalizeArabicDigits(text(value));
  const digits = normalizePhone(normalizedText);
  if (digits.length > 14) {
    const firstEgyptianMatch = normalizedText.match(/(?:\+?20\s*|0020\s*)?0?1[0125](?:[\s-]*\d){8}/u);
    if (firstEgyptianMatch) {
      const matchedDigits = normalizePhone(firstEgyptianMatch[0]);
      const localMatched = matchedDigits.startsWith('0020')
        ? matchedDigits.slice(4)
        : matchedDigits.startsWith('20') && matchedDigits.length === 12
          ? matchedDigits.slice(2)
          : matchedDigits;
      return /^1\d{9}$/.test(localMatched) ? `0${localMatched}` : localMatched;
    }
  }
  const localDigits = digits.startsWith('0020') ? digits.slice(4) : digits.startsWith('20') && digits.length === 12 ? digits.slice(2) : digits;
  return /^1\d{9}$/.test(localDigits) ? `0${localDigits}` : localDigits;
}

function normalizeArabicDigits(value: string) {
  return value.replace(/[٠-٩۰-۹]/g, digit => String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10));
}

export function parsePastedOrder(value: string, context?: WhatsAppOrderCatalogContext): ExcelRow | null {
  const fieldAliases: Array<{ key: string; aliases: string[] }> = [
    { key: 'اسم العميل', aliases: aliases.name },
    { key: 'الهاتف', aliases: aliases.phone },
    { key: 'هاتف بديل', aliases: aliases.phoneSecondary },
    { key: 'العنوان', aliases: aliases.address },
    { key: 'رابط الموقع', aliases: aliases.locationLink },
    { key: 'البراند', aliases: aliases.brand },
    { key: 'تاريخ التنفيذ', aliases: aliases.date },
    { key: 'الباقة', aliases: aliases.package.filter(alias => !['الاوردر', 'الأوردر', 'اوردر'].includes(alias)) },
    { key: 'التفاصيل', aliases: [...aliases.meals, 'الاوردر', 'الأوردر', 'اوردر'] },
    { key: 'نوع الطلب', aliases: aliases.mode },
    { key: 'المنطقة', aliases: aliases.region },
    { key: 'نوع اليوم', aliases: aliases.mealType },
    { key: 'السعر', aliases: aliases.price },
    { key: 'المبلغ', aliases: aliases.customerAmount },
    { key: 'التوصيل', aliases: aliases.deliveryFee },
    { key: 'الحالة', aliases: aliases.status },
    { key: 'المصدر', aliases: aliases.source },
    { key: 'ملاحظات', aliases: aliases.notes },
    { key: 'رقم الطلب', aliases: aliases.orderNumber.filter(alias => normalizeHeader(alias).includes('رقم') || alias === 'order number' || alias === 'order_number') },
  ];
  const parsed: ExcelRow = {};
  const normalizedText = normalizeArabicDigits(value);
  const lines = normalizedText.split(/\r?\n/u).map(line => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, '').trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(.{2,40}?)\s*[:：=]\s*(.+)$/u)
      ?? line.match(/^(.{2,32}?)\s+[-–—]\s+(.+)$/u);
    if (!match) continue;

    const label = normalizeHeader(match[1]);
    const field = fieldAliases.find(candidate => candidate.aliases.some(alias => normalizeHeader(alias) === label));
    if (field && match[2].trim()) parsed[field.key] = compactWhitespace(match[2]);
  }

  if (!parsed['الهاتف']) {
    const phoneMatch = normalizedText.match(/(?:\+?20\s*)?0?1[0125](?:[\s.-]*\d){8}/u);
    if (phoneMatch) parsed['الهاتف'] = phoneMatch[0].replace(/[\s.-]+/g, '');
  }

  // Well-formed labeled messages keep the existing behavior untouched, while still merging any extra meal lines if needed
  const labeledFieldCount = Object.entries(parsed)
    .filter(([key, fieldValue]) => key !== 'الهاتف' && text(fieldValue))
    .length;
  if (labeledFieldCount >= 2) {
    if (!parsed['التفاصيل']) {
      const smartFallback = parseWhatsAppOrder(value, context);
      if (smartFallback?.['التفاصيل']) {
        parsed['التفاصيل'] = smartFallback['التفاصيل'];
      }
    }
    return parsed;
  }

  // Free-form WhatsApp / handwritten messages: run the smart context-aware parser
  const smart = parseWhatsAppOrder(value, context);
  if (!smart) {
    return Object.keys(parsed).length ? parsed : null;
  }
  const merged: ExcelRow = { ...smart };
  for (const [key, fieldValue] of Object.entries(parsed)) {
    if (text(fieldValue)) merged[key] = fieldValue;
  }
  return merged;
}

export function parseImportedAmount(value: unknown) {
  const normalized = normalizeArabicDigits(text(value)).replace(/[٬,]/g, '').replace(/[٫]/g, '.');
  const parsed = Number(normalized.replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return date.toISOString().slice(0, 10);
  }

  const raw = normalizeArabicDigits(text(value));
  if (!raw) return getTodayDateValue();
  const dayFirst = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (parsedDate.getUTCFullYear() === Number(year) && parsedDate.getUTCMonth() === Number(month) - 1 && parsedDate.getUTCDate() === Number(day)) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? getTodayDateValue() : parsed.toISOString().slice(0, 10);
}

function listValue(value: unknown) {
  return formatImportedMealCell(value);
}

function findBrand(value: unknown, brands: Brand[]) {
  const raw = text(value).toLowerCase();
  if (!raw && brands.length === 1) return brands[0];
  if (!raw) return undefined;

  const exact = brands.find(
    (brand) => brand.id === raw || brand.name.trim().toLowerCase() === raw,
  );
  if (exact) return exact;

  if (/(?:هيلثي\s*فود|هلثي\s*فود|healthy\s*food)/iu.test(raw)) {
    return brands.find((b) => b.name.toLowerCase().includes('healthy food'));
  }
  if (/(?:هيلثي\s*ستيشن|هلثي\s*ستيشن|healthy\s*station)/iu.test(raw)) {
    return brands.find((b) => b.name.toLowerCase().includes('healthy station'));
  }
  if (/(?:بروتين\s*بوكس|protein\s*box)/iu.test(raw)) {
    return brands.find((b) => b.name.toLowerCase().includes('protein box'));
  }

  return brands.find(
    (brand) =>
      brand.name.trim().toLowerCase().includes(raw) ||
      raw.includes(brand.name.trim().toLowerCase()),
  );
}

function mapStatus(value: unknown): OrderStatus {
  const raw = text(value).toLowerCase();
  const values: Record<string, OrderStatus> = {
    new: 'new', جديد: 'new', confirmed: 'confirmed', 'تم التأكيد': 'confirmed',
    in_preparation: 'in_preparation', 'قيد التحضير': 'in_preparation',
    out_for_delivery: 'out_for_delivery', 'خرج للتوصيل': 'out_for_delivery',
    delivered: 'delivered', 'تم التسليم': 'delivered', cancelled: 'cancelled', ملغي: 'cancelled',
  };
  return values[raw] ?? 'new';
}

function mapSource(value: unknown): OrderSource {
  const raw = text(value).toLowerCase();
  if (raw.includes('facebook') || raw.includes('فيس')) return 'facebook';
  if (raw.includes('instagram') || raw.includes('انست')) return 'instagram';
  if (raw.includes('website') || raw.includes('موقع')) return 'website';
  if (raw.includes('referral') || raw.includes('إحال')) return 'referral';
  return 'other';
}

function mapMealType(value: unknown): 'lunch' | 'full_day' {
  const raw = text(value).toLowerCase();
  return raw.includes('full') || raw.includes('كامل') || raw.includes('يوم') ? 'full_day' : 'lunch';
}

export default function OrderSheetImportDialog({ saveImportedOrder, onImported, brands, meals, packages }: Props) {
  const { role, pagePermissions, isDemoMode } = useAuth();
  const { upsertCustomer } = useCustomers();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<ImportMethod>('excel');
  const [pastedText, setPastedText] = useState('');
  const [readingImage, setReadingImage] = useState(false);
  const [ocrStatusText, setOcrStatusText] = useState('جاري قراءة الصورة...');
  const [target, setTarget] = useState<ImportTarget | ''>('');
  const [workbook, setWorkbook] = useState<{ sheets: string[]; rowsBySheet: Record<string, ExcelRow[]> } | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [selectedBrandId, setSelectedBrandId] = useState('');
  const [executionDate, setExecutionDate] = useState('');
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; duplicates: number; skipped: string[] } | null>(null);

  const rows = useMemo(() => workbook?.rowsBySheet[sheetName] ?? [], [sheetName, workbook]);

  const reset = () => {
    setMethod('excel');
    setPastedText('');
    setReadingImage(false);
    setWorkbook(null);
    setSheetName('');
    setSelectedBrandId('');
    setExecutionDate('');
    setFileName('');
    setResult(null);
    setTarget('');
  };

  const changeMethod = (nextMethod: ImportMethod) => {
    setMethod(nextMethod);
    setWorkbook(null);
    setSheetName('');
    setSelectedBrandId('');
    setExecutionDate('');
    setFileName('');
    setResult(null);
    setTarget('');
  };

  const availableTargets = useMemo(() => [
    ...(isDemoMode || hasPageAccess(role, pagePermissions, 'orders') ? [{ value: 'orders' as const, label: 'صفحة الطلبات' }] : []),
    ...(isDemoMode || hasPageAccess(role, pagePermissions, 'customers') ? [{ value: 'customers' as const, label: 'صفحة العملاء' }] : []),
  ], [isDemoMode, pagePermissions, role]);

  const handleFile = async (file?: File) => {
    if (!file) return;
    setWorkbook(null);
    setResult(null);
    try {
      const XLSX = await import('xlsx');
      const parsed = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const rowsBySheet = Object.fromEntries(parsed.SheetNames.map(name => [name, XLSX.utils.sheet_to_json<ExcelRow>(parsed.Sheets[name], { defval: '' })]));
      setWorkbook({ sheets: parsed.SheetNames, rowsBySheet });
      setSheetName(parsed.SheetNames.find(name => consolidateRows(rowsBySheet[name]).length > 0) ?? parsed.SheetNames[0] ?? '');
      setSelectedBrandId('');
      setExecutionDate('');
      setFileName(file.name);
      setResult(null);
    } catch {
      toast.error('تعذر قراءة ملف Excel. تأكد أنه بصيغة xlsx أو xls.');
    }
  };

  const catalogContext = useMemo<WhatsAppOrderCatalogContext>(
    () => ({
      mealNames: meals.map((m) => m.name),
      packageNames: packages.map((p) => p.name),
      brandNames: brands.map((b) => b.name),
    }),
    [brands, meals, packages],
  );

  const prepareSingleOrder = (sourceText: string, sourceName: string) => {
    const row = parsePastedOrder(sourceText, catalogContext);
    if (!row) {
      toast.error('لم أستطع استخراج بيانات واضحة. استخدم قالبًا مثل: الاسم: ...، الهاتف: ...، العنوان: ...، الطلب: ...');
      return false;
    }

    const sheet = 'طلب مستخرج';
    const brandValue = text(cell(row, aliases.brand));
    const matchedBrand = findBrand(brandValue, brands) ?? (brands.length === 1 ? brands[0] : undefined);
    setTarget('orders');
    setWorkbook({ sheets: [sheet], rowsBySheet: { [sheet]: [row] } });
    setSheetName(sheet);
    if (matchedBrand?.id) {
      setSelectedBrandId(matchedBrand.id);
    } else if (!selectedBrandId) {
      setSelectedBrandId('');
    }
    setFileName(sourceName);
    setResult(null);
    return true;
  };

  const handleImage = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('اختر ملف صورة صالحًا');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      toast.error('حجم الصورة يتجاوز 12 ميجابايت');
      return;
    }

    setReadingImage(true);
    setOcrStatusText('جارٍ تحسين الصورة وقراءة تفاصيل الطلب...');
    try {
      const readResult = await smartReadImage(file, {
        domain: 'order',
        catalogHints: [...meals.map((m) => m.name), ...packages.map((p) => p.name)],
        brandHints: brands.map((b) => b.name),
        onProgress: (stageText) => setOcrStatusText(stageText),
      });
      setPastedText(readResult.text);
      if (prepareSingleOrder(readResult.text, file.name)) setMethod('image');
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : 'تعذر قراءة الصورة';
      toast.error(`تعذر استخراج النص من الصورة: ${errMessage}`);
    } finally {
      setReadingImage(false);
    }
  };

  const updateExtractedField = (field: string, value: string) => {
    if (!sheetName) return;
    setWorkbook(current => {
      if (!current) return current;
      const currentRows = current.rowsBySheet[sheetName] ?? [];
      if (currentRows.length === 0) return current;
      return {
        ...current,
        rowsBySheet: {
          ...current.rowsBySheet,
          [sheetName]: currentRows.map((row, index) => index === 0
            ? {
                ...row,
                [field]: value,
                ...(field === 'التفاصيل' ? { __mealItems: formatImportedMealCell(value) } : {}),
              }
            : row),
        },
      };
    });
  };

  const importRows = async () => {
    if (!target) {
      toast.error('اختر الصفحة التي ستُحفظ فيها البيانات أولًا.');
      return;
    }

    if (!workbook) {
      toast.error('ارفع ملف Excel أولًا.');
      return;
    }

    const activeSheets = workbook.sheets.filter(name => consolidateRows(workbook.rowsBySheet[name]).length > 0);
    if (activeSheets.length === 0) {
      toast.error('الملف لا يحتوي على صفوف طلبات يمكن استيرادها.');
      return;
    }

    const brand = brands.find(item => item.id === selectedBrandId);
    if (!brand) {
      toast.error('اختر العلامة التجارية التي يتبع لها الملف بالكامل.');
      return;
    }

    if (target === 'orders' && method === 'excel' && !executionDate) {
      toast.error('حدد تاريخ تنفيذ جميع الطلبات المستوردة.');
      return;
    }

    setImporting(true);
    const skipped: string[] = [];
    let imported = 0;
    let duplicates = 0;
    const importedFingerprints = new Set<string>();

    try {
      for (const sheet of activeSheets) {
        for (const [index, row] of consolidateRows(workbook.rowsBySheet[sheet]).entries()) {
      const rowNumber = row.__sourceRow ?? index + 2;
      const name = text(cell(row, aliases.name));
      const phone = normalizeImportedPhone(cell(row, aliases.phone));

      if (!name || !phone) {
        skipped.push(`صف ${rowNumber}: الاسم أو الهاتف غير موجود`);
        continue;
      }

      const customerSaved = await upsertCustomer({
        brand_id: brand.id,
        name,
        phone,
        phone_secondary: normalizeImportedPhone(cell(row, aliases.phoneSecondary)),
        address: text(cell(row, aliases.address)),
        address_house_number: '',
        address_street: '',
        address_area: '',
        address_floor: '',
        address_apartment: '',
        notes: [text(cell(row, aliases.notes)), text(cell(row, aliases.region))].filter(Boolean).join(' - '),
      });

      if (!customerSaved) {
        skipped.push(`صف ${rowNumber}: تعذر حفظ العميل`);
        continue;
      }

      if (target === 'customers') {
        imported += 1;
        continue;
      }

      const packageValue = text(cell(row, aliases.package));
      const packagePlan = packages.find(item => item.id === packageValue || item.name.toLowerCase() === packageValue.toLowerCase());
      const mealNames = Array.isArray(row.__mealItems) && row.__mealItems.length > 0
        ? row.__mealItems
        : listValue(cell(row, aliases.meals));
      const selectedMealIds = mealNames.map(nameValue => meals.find(meal => meal.id === nameValue || meal.name.toLowerCase() === nameValue.toLowerCase())?.id).filter((id): id is string => Boolean(id));
      const modeValue = text(cell(row, aliases.mode)).toLowerCase();
      const isMenuMealsOrder = packageValue === 'وجبات من المنيو' || modeValue.includes('meal') || modeValue.includes('وجبات');
      const orderMode: OrderMode = !isMenuMealsOrder && (packagePlan || packageValue || modeValue.includes('package') || modeValue.includes('باقة')) ? 'package' : 'meals';
      const customerAmount = parseImportedAmount(cell(row, aliases.customerAmount)) || parseImportedAmount(cell(row, aliases.price)) || packagePlan?.price || 0;
      const deliveryFee = parseImportedAmount(cell(row, aliases.deliveryFee));
      const importedDetails = mealNames.length === 0
        ? ''
        : `تفاصيل الطلب المستوردة: ${mealNames.join('، ')}`;
      const deliveryNote = deliveryFee > 0 ? `رسوم التوصيل: ${deliveryFee}` : '';
      const order: Omit<Order, 'id' | 'created_at'> = {
        order_number: text(cell(row, aliases.orderNumber)),
        customer_name: name,
        phone,
        phone_secondary: normalizeImportedPhone(cell(row, aliases.phoneSecondary)),
        location_link: text(cell(row, aliases.locationLink)),
        address: text(cell(row, aliases.address)),
        address_house_number: '',
        address_street: '',
        address_area: '',
        address_floor: '',
        address_apartment: '',
        execution_date: target === 'orders' && method === 'excel' ? executionDate : dateValue(cell(row, aliases.date)),
        order_mode: orderMode,
        package: packagePlan?.name ?? packageValue,
        package_plan_id: packagePlan?.id ?? null,
        meal_type: mapMealType(cell(row, aliases.mealType)),
        notes: [text(cell(row, aliases.notes)), text(cell(row, aliases.region)), importedDetails, deliveryNote].filter(Boolean).join(' - '),
        status: mapStatus(cell(row, aliases.status)),
        price: customerAmount + deliveryFee,
        customer_amount: customerAmount,
        delivery_fee: deliveryFee,
        imported_meal_details: mealNames,
        selected_meal_ids: selectedMealIds,
        source: mapSource(cell(row, aliases.source)),
        brand_id: brand.id,
        created_by: null,
      };
      order.order_number = getImportedOrderNumber(order);
      const fingerprint = JSON.stringify([order.brand_id, order.order_number]);
      if (importedFingerprints.has(fingerprint)) {
        duplicates += 1;
        continue;
      }
      importedFingerprints.add(fingerprint);

      const saved = await saveImportedOrder(order);
      if (saved === 'imported') imported += 1;
      else if (saved === 'duplicate') duplicates += 1;
          else skipped.push(`صف ${rowNumber}: تعذر حفظ الطلب`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء الاستيراد';
      console.error('Order import stopped unexpectedly', error);
      skipped.push(`توقف الاستيراد بعد حفظ ${imported} طلب: ${message}`);
    } finally {
      setImporting(false);
    }

    setResult({ imported, duplicates, skipped });
    onImported();
    if (imported > 0) toast.success(`تم استيراد ${imported} ${target === 'orders' ? 'طلب' : 'عميل'}`);
  };

  return (
    <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="rounded-2xl gap-2"><Upload className="h-4 w-4" />استيراد طلبات</Button>
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] max-w-3xl overflow-y-auto"
        onPaste={(e) => {
          const pastedImg = extractImageFromClipboardEvent(e);
          if (pastedImg && !readingImage) {
            e.preventDefault();
            setMethod('image');
            void handleImage(pastedImg);
          }
        }}
      >
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <DialogTitle>إضافة طلبات بسرعة</DialogTitle>
            <AiVisionStatusControl />
          </div>
          <DialogDescription>استورد من Excel أو اكتب/الصق رسالة العميل بأي صيغة أو ارفع صورة فاتورة/واتساب أو خط يد (أو الصقها بـ Ctrl+V).</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <Button type="button" variant={method === 'excel' ? 'default' : 'outline'} className="gap-2" onClick={() => changeMethod('excel')}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
          <Button type="button" variant={method === 'text' ? 'default' : 'outline'} className="gap-2" onClick={() => changeMethod('text')}><ClipboardPaste className="h-4 w-4" />لصق نص</Button>
          <Button type="button" variant={method === 'image' ? 'default' : 'outline'} className="gap-2" onClick={() => changeMethod('image')}><FileImage className="h-4 w-4" />صورة</Button>
        </div>

        {method === 'excel' && <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>نوع البيانات</Label>
            <Select value={target} onValueChange={value => setTarget(value as ImportTarget)}>
              <SelectTrigger><SelectValue placeholder="اختر طلبات أو عملاء" /></SelectTrigger>
              <SelectContent>{availableTargets.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="order-sheet-file">ملف Excel</Label>
            <Input id="order-sheet-file" type="file" accept=".xlsx,.xls,.csv" onChange={event => { void handleFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          </div>
          {target === 'orders' && workbook && <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="import-execution-date">تاريخ تنفيذ كل الطلبات في الملف</Label>
            <DatePicker id="import-execution-date" value={executionDate} onChange={setExecutionDate} placeholder="اختر تاريخ التنفيذ" />
            <p className="text-xs text-muted-foreground">سيُستخدم هذا التاريخ لكل الطلبات في جميع الشيتات، حتى لو كان الملف يحتوي على تواريخ أخرى.</p>
          </div>}
        </div>}

        {method === 'text' && <div className="grid gap-3">
          <Label htmlFor="pasted-order-text">الصق رسالة العميل أو تفاصيل الطلب</Label>
          <Textarea id="pasted-order-text" value={pastedText} onChange={event => setPastedText(event.target.value)} placeholder={'الاسم: أحمد محمد\nرقم الهاتف: 01012345678\nالعنوان: مدينة نصر...\nالطلب: وجبة فراخ + أرز\nالسعر: 250'} className="min-h-36" />
          <Button type="button" variant="outline" className="w-fit gap-2" onClick={() => { if (prepareSingleOrder(pastedText, 'نص ملصوق')) setMethod('text'); }}><ScanLine className="h-4 w-4" />تحليل بيانات الطلب</Button>
        </div>}

        {method === 'image' && <div className="grid gap-3">
          <Label htmlFor="order-image-file">ارفع Screenshot أو صورة الطلب</Label>
          <Input id="order-image-file" type="file" accept="image/*" disabled={readingImage} onChange={event => { void handleImage(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          <p className="text-xs text-muted-foreground">تتم قراءة الصورة داخل المتصفح باستخدام OCR. الحد الأقصى 12 ميجابايت؛ راجع النص المستخرج قبل الحفظ.</p>
          {readingImage && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{ocrStatusText}</div>}
          {!readingImage && pastedText && <div className="grid gap-2"><Label htmlFor="ocr-order-text">النص المقروء (يمكن تصحيحه ثم إعادة التحليل)</Label><Textarea id="ocr-order-text" value={pastedText} onChange={event => setPastedText(event.target.value)} className="min-h-24" /><Button type="button" variant="outline" className="w-fit gap-2" onClick={() => { if (prepareSingleOrder(pastedText, fileName || 'صورة')) setMethod('image'); }}><ScanLine className="h-4 w-4" />إعادة تحليل النص</Button></div>}
        </div>}

        {workbook && <div className="grid gap-4">
          <div className="grid gap-3">
            <Label htmlFor="import-brand">العلامة التجارية للملف بالكامل</Label>
            <Select value={selectedBrandId} onValueChange={setSelectedBrandId}>
              <SelectTrigger id="import-brand"><SelectValue placeholder="اختر العلامة التجارية مرة واحدة" /></SelectTrigger>
              <SelectContent>{brands.map(brand => <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">سيتم استيراد كل الشيتات التي تحتوي على بيانات عملاء لهذه العلامة، وتجاهل الشيتات الأخرى تلقائيًا.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-2"><Label>معاينة الشيت</Label><Select value={sheetName} onValueChange={setSheetName}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{workbook.sheets.map(sheet => <SelectItem key={sheet} value={sheet}>{sheet}</SelectItem>)}</SelectContent></Select></div>
            <Badge variant="secondary" className="h-10 justify-center px-4">{fileName} · {rows.length} صف</Badge>
          </div>
          {method !== 'excel' && rows[0] && <Card><CardContent className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="grid gap-1"><Label htmlFor="extracted-name">اسم العميل</Label><Input id="extracted-name" value={text(cell(rows[0], aliases.name))} onChange={event => updateExtractedField('اسم العميل', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-phone">رقم الهاتف</Label><Input id="extracted-phone" inputMode="tel" value={text(cell(rows[0], aliases.phone))} onChange={event => updateExtractedField('الهاتف', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-phone-secondary">هاتف بديل</Label><Input id="extracted-phone-secondary" inputMode="tel" value={text(cell(rows[0], aliases.phoneSecondary))} onChange={event => updateExtractedField('هاتف بديل', event.target.value)} /></div>
            <div className="grid gap-1 sm:col-span-2"><Label htmlFor="extracted-address">العنوان</Label><Input id="extracted-address" value={text(cell(rows[0], aliases.address))} onChange={event => updateExtractedField('العنوان', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-region">المنطقة</Label><Input id="extracted-region" value={text(cell(rows[0], aliases.region))} onChange={event => updateExtractedField('المنطقة', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-package">الباقة</Label><Input id="extracted-package" value={text(cell(rows[0], aliases.package))} onChange={event => updateExtractedField('الباقة', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-meals">تفاصيل الطلب / الوجبات</Label><Input id="extracted-meals" value={text(cell(rows[0], aliases.meals))} onChange={event => updateExtractedField('التفاصيل', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-date">تاريخ التنفيذ</Label><DatePicker id="extracted-date" value={isValidDateValue(text(cell(rows[0], aliases.date))) ? text(cell(rows[0], aliases.date)) : ''} onChange={value => updateExtractedField('تاريخ التنفيذ', value)} placeholder="اختر تاريخ التنفيذ" /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-price">السعر</Label><Input id="extracted-price" inputMode="decimal" value={text(cell(rows[0], aliases.customerAmount)) || text(cell(rows[0], aliases.price))} onChange={event => updateExtractedField('المبلغ', event.target.value)} /></div>
            <div className="grid gap-1"><Label htmlFor="extracted-delivery">رسوم التوصيل</Label><Input id="extracted-delivery" inputMode="decimal" value={text(cell(rows[0], aliases.deliveryFee))} onChange={event => updateExtractedField('التوصيل', event.target.value)} /></div>
            <div className="grid gap-1 sm:col-span-2"><Label htmlFor="extracted-location">رابط الموقع (اختياري)</Label><Input id="extracted-location" value={text(cell(rows[0], aliases.locationLink))} onChange={event => updateExtractedField('رابط الموقع', event.target.value)} /></div>
            <div className="grid gap-1 sm:col-span-2"><Label htmlFor="extracted-notes">ملاحظات</Label><Textarea id="extracted-notes" value={text(cell(rows[0], aliases.notes))} onChange={event => updateExtractedField('ملاحظات', event.target.value)} /></div>
          </CardContent></Card>}
          <Card><CardContent className="p-3">
            <p className="mb-2 text-sm font-medium">معاينة أول 5 صفوف</p>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-right text-xs"><thead><tr>{Object.keys(rows[0] ?? {}).slice(0, 6).map(header => <th key={header} className="border-b p-2 font-semibold">{header}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={index}>{Object.values(row).slice(0, 6).map((value, valueIndex) => <td key={valueIndex} className="border-b p-2">{text(value) || '-'}</td>)}</tr>)}</tbody></table></div>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">الأعمدة المدعومة تشمل: اسم العميل، الهاتف، البراند، العنوان، تاريخ التنفيذ، الباقة، الوجبات، السعر، الحالة والملاحظات.</p>
        </div>}

        {result && <div className="grid gap-2 rounded-lg border p-3 text-sm"><div className="flex items-center gap-2 text-green-700"><CheckCircle2 className="h-4 w-4" />تم استيراد {result.imported} {target === 'orders' ? 'طلب' : 'عميل'}.</div>{result.duplicates > 0 && <p className="text-amber-700">تم تجاهل {result.duplicates} طلب مكرر لتجنب تكرار التنفيذ.</p>}{result.skipped.length > 0 && <div className="text-destructive"><div className="mb-1 flex items-center gap-2"><AlertCircle className="h-4 w-4" />تعذر حفظ {result.skipped.length} صف:</div><ul className="max-h-28 list-disc overflow-y-auto pr-5">{result.skipped.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}</div>}

        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>إغلاق</Button><Button onClick={() => void importRows()} disabled={!target || !workbook || rows.length === 0 || !selectedBrandId || (target === 'orders' && method === 'excel' && !executionDate) || importing || readingImage} className="gap-2">{importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}استيراد الطلبات دفعة واحدة</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}