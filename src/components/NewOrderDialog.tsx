import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ArrowRight, Check, History, Loader2, MapPin, Plus, Search, Sparkles, UserPlus, Users } from 'lucide-react';
import { Order, OrderMealCustomization, MealType, OrderMode, OrderSource, ORDER_MODE_LABELS, SOURCE_LABELS } from '@/types/order';
import { Customer } from '@/types/customer';
import { MENU_CATEGORY_LABELS } from '@/types/menu';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useBrands } from '@/hooks/useBrands';
import { useCustomers } from '@/hooks/useCustomers';
import { useMenuCatalog } from '@/hooks/useMenuCatalog';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn, compactWhitespace, formatDetailedAddress, formatEGPCurrency, getArabicWeekday, getTodayDateValue, hasDetailedAddressParts, isDateMatchingWeekday, isSupportedLocationLink, isValidDateValue, normalizeLocationLink, normalizePhone } from '@/lib/utils';

type NewOrderFormState = {
  customer_name: string;
  phone: string;
  phone_secondary: string;
  location_link: string;
  address: string;
  address_house_number: string;
  address_street: string;
  address_area: string;
  address_floor: string;
  address_apartment: string;
  execution_date: string;
  execution_day: string;
  order_mode: OrderMode;
  package: string;
  package_plan_id: string;
  selected_meal_ids: string[];
  meal_type: MealType;
  notes: string;
  source: OrderSource;
  brand_id: string;
  meal_customization_notes: Record<string, string>;
};

type FormField = keyof NewOrderFormState;
type FormErrors = Partial<Record<FormField, string>>;
type WorkflowStep = 'mode' | 'customer' | 'order';
type CustomerMode = 'new' | 'existing';
type AddressMode = 'saved' | 'new';

function createInitialFormState(defaultBrandId = ''): NewOrderFormState {
  const executionDate = getTodayDateValue();

  return {
    customer_name: '',
    phone: '',
    phone_secondary: '',
    location_link: '',
    address: '',
    address_house_number: '',
    address_street: '',
    address_area: '',
    address_floor: '',
    address_apartment: '',
    execution_date: executionDate,
    execution_day: getArabicWeekday(executionDate),
    order_mode: 'package',
    package: '',
    package_plan_id: '',
    selected_meal_ids: [],
    meal_type: 'lunch',
    notes: '',
    source: 'other',
    brand_id: defaultBrandId,
    meal_customization_notes: {},
  };
}

function createAddressPreview(form: Pick<NewOrderFormState, 'address' | 'address_house_number' | 'address_street' | 'address_area' | 'address_floor' | 'address_apartment'>) {
  if (hasDetailedAddressParts(form)) {
    return formatDetailedAddress(form);
  }

  return compactWhitespace(form.address);
}

const steps: Array<{ id: WorkflowStep; label: string; hint: string }> = [
  { id: 'mode', label: 'نوع العميل', hint: 'ابدأ من هنا' },
  { id: 'customer', label: 'بيانات العميل', hint: 'تحميل أو إدخال سريع' },
  { id: 'order', label: 'تفاصيل الأوردر', hint: 'إنهاء الحجز' },
];

interface Props {
  onCreated: () => void;
  addOrder: (order: Omit<Order, 'id' | 'created_at'>) => Promise<boolean>;
}

export default function NewOrderDialog({ onCreated, addOrder }: Props) {
  const { user } = useAuth();
  const { brands } = useBrands();
  const { meals, packages } = useMenuCatalog();
  const { customers, loading: customersLoading, storageMode, upsertCustomer } = useCustomers();
  const singleAccessibleBrand = brands.length === 1 ? brands[0] : null;
  const defaultBrandId = singleAccessibleBrand?.id ?? '';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<WorkflowStep>('mode');
  const [customerMode, setCustomerMode] = useState<CustomerMode | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [addressMode, setAddressMode] = useState<AddressMode>('saved');
  const [saveNewAddressAsDefault, setSaveNewAddressAsDefault] = useState(true);
  const [creating, setCreating] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [form, setForm] = useState<NewOrderFormState>(() => createInitialFormState(defaultBrandId));
  const [errors, setErrors] = useState<FormErrors>({});
  const deferredCustomerSearch = useDeferredValue(customerSearch);
  const todayDate = getTodayDateValue();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (brands.length === 1 && !form.brand_id) {
      setForm(current => ({ ...current, brand_id: brands[0].id }));
    }
  }, [brands, form.brand_id]);

  const selectedCustomer = useMemo(
    () => customers.find(customer => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const brandCustomers = useMemo(
    () => customers.filter(customer => customer.brand_id === form.brand_id),
    [customers, form.brand_id],
  );

  const brandPackages = useMemo(
    () => packages.filter(pkg => pkg.brand_id === form.brand_id),
    [packages, form.brand_id],
  );

  const brandMeals = useMemo(
    () => meals.filter(meal => meal.brand_id === form.brand_id),
    [meals, form.brand_id],
  );

  const selectedPackagePlan = useMemo(
    () => brandPackages.find(pkg => pkg.id === form.package_plan_id) ?? null,
    [brandPackages, form.package_plan_id],
  );

  const selectedMeals = useMemo(
    () => brandMeals.filter(meal => form.selected_meal_ids.includes(meal.id)),
    [brandMeals, form.selected_meal_ids],
  );

  const selectedMealNames = useMemo(
    () => selectedMeals.map(meal => meal.name),
    [selectedMeals],
  );

  const customizableMeals = useMemo(() => {
    if (form.order_mode === 'package') {
      return (selectedPackagePlan?.items ?? []).map((item) => ({
        key: item.id,
        label: item.label,
      }));
    }

    return selectedMeals.map((meal) => ({
      key: meal.id,
      label: meal.name,
    }));
  }, [form.order_mode, selectedMeals, selectedPackagePlan]);

  const mealCustomizations = useMemo<OrderMealCustomization[]>(() => {
    return customizableMeals
      .map((meal) => ({
        key: meal.key,
        label: meal.label,
        notes: compactWhitespace(form.meal_customization_notes[meal.key] ?? ''),
      }))
      .filter(item => item.notes);
  }, [customizableMeals, form.meal_customization_notes]);

  useEffect(() => {
    setForm((current) => {
      const nextNotes = Object.fromEntries(
        Object.entries(current.meal_customization_notes).filter(([key]) => customizableMeals.some(meal => meal.key === key)),
      );

      if (Object.keys(nextNotes).length === Object.keys(current.meal_customization_notes).length) {
        return current;
      }

      return {
        ...current,
        meal_customization_notes: nextNotes,
      };
    });
  }, [customizableMeals]);

  const estimatedPrice = useMemo(() => {
    if (form.order_mode === 'package') {
      return selectedPackagePlan?.price ?? 0;
    }

    return selectedMeals.reduce((sum, meal) => sum + (meal.price ?? 0), 0);
  }, [form.order_mode, selectedMeals, selectedPackagePlan]);

  const existingCustomerResults = useMemo(() => {
    if (!form.brand_id) {
      return [];
    }

    const rawQuery = compactWhitespace(deferredCustomerSearch).toLowerCase();
    const normalizedQuery = normalizePhone(deferredCustomerSearch);

    return brandCustomers
      .filter(customer => {
        if (!rawQuery && !normalizedQuery) {
          return true;
        }

        return customer.name.toLowerCase().includes(rawQuery)
          || normalizePhone(customer.phone).includes(normalizedQuery)
          || normalizePhone(customer.phone_secondary).includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [brandCustomers, deferredCustomerSearch, form.brand_id]);

  const duplicateMatches = useMemo(() => {
    if (!form.brand_id) {
      return [];
    }

    const normalizedPhone = normalizePhone(form.phone);
    const normalizedName = compactWhitespace(form.customer_name).toLowerCase();

    return brandCustomers
      .filter(customer => {
        const matchesPhone = normalizedPhone.length >= 6 && normalizePhone(customer.phone).includes(normalizedPhone);
        const matchesName = normalizedName.length >= 3 && customer.name.toLowerCase().includes(normalizedName);
        return matchesPhone || matchesName;
      })
      .slice(0, 3);
  }, [brandCustomers, form.brand_id, form.customer_name, form.phone]);

  const addressPreview = createAddressPreview(form);
  const currentStepIndex = steps.findIndex(item => item.id === step);

  const resetWorkflow = () => {
    setStep('mode');
    setCustomerMode(null);
    setSelectedCustomerId(null);
    setAddressMode('saved');
    setSaveNewAddressAsDefault(true);
    setCreating(false);
    setCustomerSearch('');
    setErrors({});
    setForm(createInitialFormState(brands.length === 1 ? brands[0].id : ''));
  };

  const setField = <K extends keyof NewOrderFormState>(key: K, value: NewOrderFormState[K]) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      if (!current[key]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[key];
      return nextErrors;
    });
  };

  const clearAddressFields = () => {
    setForm(current => ({
      ...current,
      address: '',
      address_house_number: '',
      address_street: '',
      address_area: '',
      address_floor: '',
      address_apartment: '',
    }));
  };

  const setCustomerFromRecord = (customer: Customer, nextAddressMode: AddressMode = customer.address ? 'saved' : 'new') => {
    setSelectedCustomerId(customer.id);
    setAddressMode(nextAddressMode);
    setCustomerSearch(customer.name);
    setForm(current => ({
      ...current,
      brand_id: customer.brand_id ?? current.brand_id,
      customer_name: customer.name,
      phone: customer.phone,
      phone_secondary: customer.phone_secondary,
      notes: current.notes || customer.notes,
      address: customer.address,
      address_house_number: nextAddressMode === 'saved' ? customer.address_house_number : '',
      address_street: nextAddressMode === 'saved' ? customer.address_street : '',
      address_area: nextAddressMode === 'saved' ? customer.address_area : '',
      address_floor: nextAddressMode === 'saved' ? customer.address_floor : '',
      address_apartment: nextAddressMode === 'saved' ? customer.address_apartment : '',
    }));
    setErrors(current => {
      const nextErrors = { ...current };
      delete nextErrors.customer_name;
      delete nextErrors.phone;
      delete nextErrors.address;
      delete nextErrors.address_house_number;
      delete nextErrors.address_street;
      delete nextErrors.address_area;
      delete nextErrors.address_floor;
      delete nextErrors.address_apartment;
      return nextErrors;
    });
  };

  const handleAddressModeChange = (nextMode: AddressMode) => {
    setAddressMode(nextMode);
    if (!selectedCustomer) {
      return;
    }

    if (nextMode === 'saved') {
      setCustomerFromRecord(selectedCustomer, 'saved');
      return;
    }

    clearAddressFields();
  };

  const handleBrandChange = (brandId: string) => {
    setField('brand_id', brandId);
    setSelectedCustomerId(null);
    setCustomerSearch('');
    setForm(current => ({
      ...current,
      brand_id: brandId,
      order_mode: 'package',
      package: '',
      package_plan_id: '',
      selected_meal_ids: [],
      meal_customization_notes: {},
    }));

    if (customerMode === 'existing') {
      setForm(current => ({
        ...current,
        customer_name: '',
        phone: '',
        phone_secondary: '',
        location_link: '',
        address: '',
        address_house_number: '',
        address_street: '',
        address_area: '',
        address_floor: '',
        address_apartment: '',
        order_mode: 'package',
        package: '',
        package_plan_id: '',
        selected_meal_ids: [],
        meal_customization_notes: {},
      }));
    }
  };

  const handleOrderModeChange = (nextMode: OrderMode) => {
    setForm(current => ({
      ...current,
      order_mode: nextMode,
      package: '',
      package_plan_id: '',
      selected_meal_ids: [],
      meal_customization_notes: {},
    }));
    setErrors(current => {
      const nextErrors = { ...current };
      delete nextErrors.package;
      return nextErrors;
    });
  };

  const handlePackagePlanChange = (packagePlanId: string) => {
    setForm(current => ({
      ...current,
      package_plan_id: packagePlanId,
      package: brandPackages.find(pkg => pkg.id === packagePlanId)?.name ?? '',
      meal_customization_notes: {},
    }));
  };

  const toggleSelectedMeal = (mealId: string) => {
    setForm(current => ({
      ...current,
      meal_customization_notes: current.selected_meal_ids.includes(mealId)
        ? Object.fromEntries(Object.entries(current.meal_customization_notes).filter(([key]) => key !== mealId))
        : current.meal_customization_notes,
      selected_meal_ids: current.selected_meal_ids.includes(mealId)
        ? current.selected_meal_ids.filter(id => id !== mealId)
        : [...current.selected_meal_ids, mealId],
    }));
    setErrors(current => {
      const nextErrors = { ...current };
      delete nextErrors.package;
      return nextErrors;
    });
  };

  const setMealCustomizationNote = (mealKey: string, value: string) => {
    setForm(current => ({
      ...current,
      meal_customization_notes: {
        ...current.meal_customization_notes,
        [mealKey]: value,
      },
    }));
  };

  const handleExecutionDateChange = (executionDate: string) => {
    setForm(current => ({
      ...current,
      execution_date: executionDate,
      execution_day: getArabicWeekday(executionDate),
    }));
    setErrors(current => {
      const nextErrors = { ...current };
      delete nextErrors.execution_date;
      delete nextErrors.execution_day;
      return nextErrors;
    });
  };

  const getFieldError = (field: FormField) => errors[field];
  const fieldClassName = (field: FormField) => cn(getFieldError(field) && 'border-destructive focus-visible:ring-destructive');

  const renderFieldError = (field: FormField) => {
    const message = getFieldError(field);
    return message ? <p className="text-xs text-destructive">{message}</p> : null;
  };

  const renderBrandField = (placeholder = 'اختر العلامة') => {
    if (singleAccessibleBrand) {
      return (
        <div className="grid gap-1.5">
          <Label>العلامة التجارية</Label>
          <div className="flex min-h-10 items-center rounded-md border bg-muted/40 px-3 text-sm font-medium text-foreground">
            {singleAccessibleBrand.name}
          </div>
        </div>
      );
    }

    return (
      <div className="grid gap-1.5">
        <Label>العلامة التجارية *</Label>
        <Select value={form.brand_id} onValueChange={handleBrandChange}>
          <SelectTrigger className={fieldClassName('brand_id')}><SelectValue placeholder={brands.length === 0 ? 'لا توجد علامات متاحة' : placeholder} /></SelectTrigger>
          <SelectContent>
            {brands.map(brand => (
              <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFieldError('brand_id')}
      </div>
    );
  };

  const validateAddressFields = (nextErrors: FormErrors) => {
    if (!compactWhitespace(form.address_house_number)) nextErrors.address_house_number = 'اكتب رقم البيت';
    if (!compactWhitespace(form.address_street)) nextErrors.address_street = 'اكتب اسم الشارع';
    if (!compactWhitespace(form.address_area)) nextErrors.address_area = 'اكتب المنطقة';
    if (!compactWhitespace(form.address_floor)) nextErrors.address_floor = 'اكتب الدور';
    if (!compactWhitespace(form.address_apartment)) nextErrors.address_apartment = 'اكتب رقم الشقة';
  };

  const validateCustomerStep = () => {
    const nextErrors: FormErrors = {};

    if (!form.brand_id) {
      nextErrors.brand_id = brands.length === 0 ? 'لا توجد علامات متاحة لهذا المستخدم' : 'اختر العلامة التجارية أولًا';
    }

    if (customerMode === 'existing') {
      if (!selectedCustomer) {
        nextErrors.customer_name = 'اختر عميلًا موجودًا من نتائج البحث';
      }

      if (addressMode === 'new' || !selectedCustomer?.address) {
        validateAddressFields(nextErrors);
      }
    }

    if (customerMode === 'new') {
      if (!compactWhitespace(form.customer_name)) nextErrors.customer_name = 'اكتب اسم العميل';

      const normalizedPrimaryPhone = normalizePhone(form.phone);
      if (!normalizedPrimaryPhone) {
        nextErrors.phone = 'اكتب رقم الهاتف الأساسي';
      } else if (normalizedPrimaryPhone.length < 10) {
        nextErrors.phone = 'رقم الهاتف غير مكتمل';
      }

      const normalizedSecondaryPhone = normalizePhone(form.phone_secondary);
      if (normalizedSecondaryPhone && normalizedSecondaryPhone.length < 10) {
        nextErrors.phone_secondary = 'رقم الهاتف البديل غير مكتمل';
      }

      validateAddressFields(nextErrors);
    }

    return nextErrors;
  };

  const validateOrderStep = () => {
    const nextErrors: FormErrors = {};

    if (!form.execution_date) {
      nextErrors.execution_date = 'اختر تاريخ التنفيذ';
    } else if (!isValidDateValue(form.execution_date)) {
      nextErrors.execution_date = 'تاريخ التنفيذ غير صالح';
    } else if (form.execution_date < todayDate) {
      nextErrors.execution_date = 'لا يمكن اختيار تاريخ تنفيذ في الماضي';
    }

    if (form.execution_date && !isDateMatchingWeekday(form.execution_date, form.execution_day)) {
      nextErrors.execution_day = 'اليوم لا يطابق التاريخ المحدد';
    }

    if (form.location_link && !isSupportedLocationLink(form.location_link)) {
      nextErrors.location_link = 'أدخل رابط موقع صحيح من Google Maps أو Waze أو Apple Maps';
    }

    if (form.order_mode === 'package' && !form.package_plan_id) {
      nextErrors.package = 'اختر الباقة';
    }

    if (form.order_mode === 'meals' && form.selected_meal_ids.length === 0) {
      nextErrors.package = 'اختر وجبة واحدة على الأقل';
    }

    return nextErrors;
  };

  const persistCustomer = async () => {
    if (!form.brand_id) {
      return null;
    }

    if (customerMode === 'existing' && (!saveNewAddressAsDefault || addressMode === 'saved')) {
      return selectedCustomer;
    }

    return upsertCustomer({
      id: selectedCustomer?.record_source === 'customers' ? selectedCustomer.id : undefined,
      brand_id: form.brand_id,
      name: compactWhitespace(form.customer_name),
      phone: compactWhitespace(form.phone),
      phone_secondary: compactWhitespace(form.phone_secondary),
      address: addressPreview,
      address_house_number: compactWhitespace(form.address_house_number),
      address_street: compactWhitespace(form.address_street),
      address_area: compactWhitespace(form.address_area),
      address_floor: compactWhitespace(form.address_floor),
      address_apartment: compactWhitespace(form.address_apartment),
      notes: compactWhitespace(form.notes),
    });
  };

  const handleCustomerContinue = async () => {
    const nextErrors = validateCustomerStep();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors)[0] ?? 'راجع بيانات العميل');
      return;
    }

    if (customerMode === 'new') {
      const customer = await persistCustomer();
      if (!customer) {
        return;
      }
      setSelectedCustomerId(customer.id);
    }

    setStep('order');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors = { ...validateCustomerStep(), ...validateOrderStep() };
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(Object.values(nextErrors)[0] ?? 'راجع البيانات المطلوبة');
      return;
    }

    const packageLabel = form.order_mode === 'package'
      ? selectedPackagePlan?.name ?? ''
      : selectedMealNames.join(' + ');

    if (!packageLabel) {
      toast.error(form.order_mode === 'package' ? 'اختر الباقة أولًا' : 'اختر وجبات من المنيو أولًا');
      return;
    }

    setCreating(true);

    if (customerMode === 'new' || (customerMode === 'existing' && addressMode === 'new' && saveNewAddressAsDefault)) {
      const customer = await persistCustomer();
      if (customer) {
        setSelectedCustomerId(customer.id);
      } else if (customerMode === 'new') {
        setCreating(false);
        return;
      }
    }

    const success = await addOrder({
      order_number: `ORD-${Date.now().toString(36).toUpperCase()}`,
      customer_name: compactWhitespace(form.customer_name),
      phone: normalizePhone(form.phone),
      phone_secondary: normalizePhone(form.phone_secondary),
      location_link: normalizeLocationLink(form.location_link),
      address: addressPreview,
      address_house_number: compactWhitespace(form.address_house_number),
      address_street: compactWhitespace(form.address_street),
      address_area: compactWhitespace(form.address_area),
      address_floor: compactWhitespace(form.address_floor),
      address_apartment: compactWhitespace(form.address_apartment),
      execution_date: form.execution_date,
      order_mode: form.order_mode,
      package: packageLabel,
      package_plan_id: form.order_mode === 'package' ? form.package_plan_id : null,
      selected_meal_ids: form.order_mode === 'meals' ? form.selected_meal_ids : [],
      package_meal_snapshot: form.order_mode === 'package'
        ? (selectedPackagePlan?.items ?? []).map((item) => ({
            key: item.id,
            label: item.label,
            category: item.menu_item_id
              ? (brandMeals.find(meal => meal.id === item.menu_item_id)?.category ?? null)
              : null,
          }))
        : [],
      meal_type: form.meal_type,
      notes: compactWhitespace(form.notes),
      meal_customizations: mealCustomizations,
      status: 'new',
      price: estimatedPrice,
      source: form.source,
      brand_id: form.brand_id,
      created_by: user?.id ?? null,
    });

    setCreating(false);

    if (success) {
      toast.success('تم إنشاء الطلب بنجاح');
      resetWorkflow();
      setOpen(false);
      onCreated();
    }
  };

  const renderAddressFields = () => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label>رقم البيت *</Label>
        <Input value={form.address_house_number} onChange={e => setField('address_house_number', e.target.value)} placeholder="مثال: 15" className={fieldClassName('address_house_number')} />
        {renderFieldError('address_house_number')}
      </div>
      <div className="grid gap-1.5">
        <Label>اسم الشارع *</Label>
        <Input value={form.address_street} onChange={e => setField('address_street', e.target.value)} placeholder="مثال: شارع النصر" className={fieldClassName('address_street')} />
        {renderFieldError('address_street')}
      </div>
      <div className="grid gap-1.5">
        <Label>المنطقة *</Label>
        <Input value={form.address_area} onChange={e => setField('address_area', e.target.value)} placeholder="مدينة نصر" className={fieldClassName('address_area')} />
        {renderFieldError('address_area')}
      </div>
      <div className="grid gap-1.5">
        <Label>الدور *</Label>
        <Input value={form.address_floor} onChange={e => setField('address_floor', e.target.value)} placeholder="3" className={fieldClassName('address_floor')} />
        {renderFieldError('address_floor')}
      </div>
      <div className="grid gap-1.5 sm:col-span-2">
        <Label>رقم الشقة *</Label>
        <Input value={form.address_apartment} onChange={e => setField('address_apartment', e.target.value)} placeholder="12" className={fieldClassName('address_apartment')} />
        {renderFieldError('address_apartment')}
      </div>
    </div>
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetWorkflow();
    }
  };

  const triggerButton = (
    <Button size="lg" className="gap-2 rounded-2xl shadow-lg hover:shadow-xl transition-shadow">
      <Plus className="h-5 w-5" /> إضافة أوردر جديد
    </Button>
  );

  const surfaceContent = (
    <div className={cn(
      'flex h-full min-h-0 flex-col overflow-hidden bg-background',
      isMobile
        ? 'rounded-t-[28px]'
        : 'rounded-[24px] border border-white/60 shadow-2xl sm:rounded-[28px]',
    )}>
          <div className="relative shrink-0 border-b bg-[radial-gradient(circle_at_top_right,rgba(34,197,94,0.18),transparent_38%),radial-gradient(circle_at_top_left,rgba(251,191,36,0.18),transparent_34%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,247,245,0.92))] px-4 py-4 sm:px-8 sm:py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col space-y-1.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Badge className="gap-1 rounded-full bg-white/90 px-3 py-1 text-primary shadow-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                    تسجيل سريع للكول سنتر
                  </Badge>
                </div>
                <h2 className="mt-3 text-2xl font-semibold leading-none tracking-tight">أوردر ذكي في أقل عدد خطوات</h2>
                <p className="text-sm text-muted-foreground">
                  اختر نوع العميل، حمّل بياناته فورًا، ثم أكمل الأوردر بدون تكرار أو كتابة مرهقة.
                </p>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm shadow-sm backdrop-blur">
                <p className="font-semibold text-foreground">وضع البيانات الحالي</p>
                <p className="mt-1 text-muted-foreground">
                  {storageMode === 'customers' ? 'يتم الحفظ في قسم العملاء مباشرة.' : 'يتم تكوين العملاء تلقائيًا من الطلبات الحالية لحين تفعيل الجدول.'}
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {steps.map((item, index) => {
                const isActive = index === currentStepIndex;
                const isCompleted = index < currentStepIndex;

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'rounded-2xl border px-4 py-3 transition-all',
                      isActive && 'border-primary bg-primary/10 shadow-sm',
                      isCompleted && 'border-emerald-200 bg-emerald-50',
                      !isActive && !isCompleted && 'border-border bg-white/70',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.hint}</p>
                      </div>
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                        isCompleted && 'bg-emerald-500 text-white',
                        isActive && 'bg-primary text-white',
                        !isActive && !isCompleted && 'bg-muted text-muted-foreground',
                      )}>
                        {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-8 sm:py-5">
              {step === 'mode' && (
                <div className="grid gap-4">
                  <Card className="border-dashed bg-muted/20">
                    <CardContent className="grid gap-3 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{singleAccessibleBrand ? 'البراند المرتبط بحسابك' : 'اختر البراند أولًا'}</p>
                          <p className="text-xs text-muted-foreground">
                            {singleAccessibleBrand ? 'تم ربط الأوردر تلقائيًا ببراندك المتاح.' : 'العملاء مسجلون بشكل منفصل لكل علامة تجارية.'}
                          </p>
                        </div>
                        <Badge variant="outline">{brands.length} براند</Badge>
                      </div>
                      {renderBrandField()}
                    </CardContent>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!form.brand_id) {
                          setErrors({ brand_id: 'اختر العلامة التجارية أولًا' });
                          toast.error('اختر العلامة التجارية أولًا');
                          return;
                        }
                        setCustomerMode('existing');
                        setStep('customer');
                      }}
                      className="group rounded-[24px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(239,246,255,0.92))] p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="rounded-2xl bg-info/10 p-3 text-info"><History className="h-6 w-6" /></div>
                        <Badge className="bg-info/10 text-info hover:bg-info/10">أسرع اختيار</Badge>
                      </div>
                      <h3 className="mt-5 text-xl font-bold text-foreground">عميل قديم</h3>
                      <p className="mt-2 text-sm text-muted-foreground">ابحث بالاسم أو الهاتف، حمّل البيانات فورًا، وكمّل الأوردر في ثوانٍ.</p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!form.brand_id) {
                          setErrors({ brand_id: 'اختر العلامة التجارية أولًا' });
                          toast.error('اختر العلامة التجارية أولًا');
                          return;
                        }
                        setCustomerMode('new');
                        setStep('customer');
                      }}
                      className="group rounded-[24px] border border-border bg-[linear-gradient(135deg,rgba(255,255,255,1),rgba(240,253,244,0.94))] p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="rounded-2xl bg-primary/10 p-3 text-primary"><UserPlus className="h-6 w-6" /></div>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">إدخال ذكي</Badge>
                      </div>
                      <h3 className="mt-5 text-xl font-bold text-foreground">عميل جديد</h3>
                      <p className="mt-2 text-sm text-muted-foreground">سجّل بياناته بسرعة، واكتشف التكرار أثناء الكتابة قبل إنشاء الأوردر.</p>
                    </button>
                  </div>
                </div>
              )}

              {step === 'customer' && customerMode === 'existing' && (
                <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                  <Card className="overflow-hidden border-0 bg-muted/20 shadow-none">
                    <CardContent className="grid gap-4 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-foreground">بحث سريع عن عميل قديم</p>
                          <p className="text-sm text-muted-foreground">اكتب الاسم أو رقم الهاتف، والنتائج تظهر مباشرة.</p>
                        </div>
                        <Badge variant="outline">{brandCustomers.length} عميل متاح</Badge>
                      </div>
                      {renderBrandField()}
                      <div className="relative">
                        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="ابحث بالاسم أو الهاتف" className="pr-9" />
                      </div>
                      <div className="max-h-[360px] space-y-3 overflow-y-auto pl-1">
                        {customersLoading ? (
                          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                        ) : existingCustomerResults.length === 0 ? (
                          <div className="rounded-2xl border border-dashed bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                            {form.brand_id ? 'لا توجد نتائج مطابقة. يمكنك العودة واختيار عميل جديد.' : 'اختر البراند أولًا لعرض العملاء.'}
                          </div>
                        ) : (
                          existingCustomerResults.map(customer => {
                            const isSelected = customer.id === selectedCustomerId;

                            return (
                              <button
                                key={customer.id}
                                type="button"
                                onClick={() => setCustomerFromRecord(customer)}
                                className={cn(
                                  'w-full rounded-2xl border bg-background p-4 text-right transition hover:border-primary hover:shadow-md',
                                  isSelected && 'border-primary bg-primary/5 shadow-md',
                                )}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-base font-semibold text-foreground">{customer.name}</p>
                                    <p className="mt-1 text-sm text-muted-foreground">{customer.phone}</p>
                                  </div>
                                  <Badge variant={customer.record_source === 'customers' ? 'default' : 'outline'}>
                                    {customer.record_source === 'customers' ? 'من قسم العملاء' : 'من الطلبات'}
                                  </Badge>
                                </div>
                                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                                  <span>آخر عنوان: {customer.address || 'لا يوجد عنوان محفوظ'}</span>
                                  <span>عدد الطلبات: {customer.order_count}</span>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                      {renderFieldError('customer_name')}
                    </CardContent>
                  </Card>

                  <Card className="border-0 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(249,250,251,1))] shadow-sm">
                    <CardContent className="grid gap-4 p-4">
                      <div>
                        <p className="text-lg font-bold text-foreground">ملخص العميل المختار</p>
                        <p className="text-sm text-muted-foreground">اختيار العنوان هنا يمنع الأخطاء أثناء تسجيل الأوردر.</p>
                      </div>

                      {selectedCustomer ? (
                        <>
                          <div className="rounded-2xl border bg-muted/20 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">{selectedCustomer.name}</p>
                                <p className="text-sm text-muted-foreground">{selectedCustomer.phone}</p>
                              </div>
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            {selectedCustomer.phone_secondary && <p className="mt-3 text-sm text-muted-foreground">رقم بديل: {selectedCustomer.phone_secondary}</p>}
                            <p className="mt-3 text-sm text-muted-foreground">العنوان الحالي: {selectedCustomer.address || 'لا يوجد عنوان محفوظ'}</p>
                          </div>

                          <div className="grid gap-2">
                            <Label>اختيار العنوان</Label>
                            <div className="grid gap-2">
                              <button
                                type="button"
                                onClick={() => handleAddressModeChange('saved')}
                                className={cn('rounded-2xl border p-3 text-right transition', addressMode === 'saved' ? 'border-primary bg-primary/5' : 'bg-background')}
                              >
                                <p className="font-semibold text-foreground">استخدام العنوان المسجل</p>
                                <p className="text-sm text-muted-foreground">تحميل العنوان الحالي كما هو لتقليل الكتابة اليدوية.</p>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddressModeChange('new')}
                                className={cn('rounded-2xl border p-3 text-right transition', addressMode === 'new' ? 'border-primary bg-primary/5' : 'bg-background')}
                              >
                                <p className="font-semibold text-foreground">إدخال عنوان جديد</p>
                                <p className="text-sm text-muted-foreground">استخدمه عندما يطلب العميل توصيلًا لمكان مختلف.</p>
                              </button>
                            </div>
                          </div>

                          {addressMode === 'new' && (
                            <div className="grid gap-4 rounded-2xl border border-dashed bg-background p-4">
                              {renderAddressFields()}
                              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                                <input type="checkbox" checked={saveNewAddressAsDefault} onChange={e => setSaveNewAddressAsDefault(e.target.checked)} />
                                حفظ العنوان الجديد كعنوان افتراضي للعميل
                              </label>
                            </div>
                          )}

                          <div className="rounded-2xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                            العنوان النهائي: {addressMode === 'saved' ? (selectedCustomer.address || 'لا يوجد عنوان محفوظ') : (addressPreview || 'أكمل تفاصيل العنوان الجديد')}
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground">
                          اختر عميلًا من القائمة ليتم تحميل بياناته هنا فورًا.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {step === 'customer' && customerMode === 'new' && (
                <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <Card className="border-0 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(244,247,245,1))] shadow-sm">
                    <CardContent className="grid gap-4 p-4">
                      <div>
                        <p className="text-lg font-bold text-foreground">تسجيل عميل جديد</p>
                        <p className="text-sm text-muted-foreground">أدخل الحد الأدنى من البيانات ثم ننتقل مباشرة لتفاصيل الأوردر.</p>
                      </div>

                      {renderBrandField()}

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5 sm:col-span-2">
                          <Label>اسم العميل *</Label>
                          <Input value={form.customer_name} onChange={e => setField('customer_name', e.target.value)} placeholder="الاسم الكامل" className={fieldClassName('customer_name')} />
                          {renderFieldError('customer_name')}
                        </div>
                        <div className="grid gap-1.5">
                          <Label>رقم الهاتف الأساسي *</Label>
                          <Input value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="01001234567" className={fieldClassName('phone')} />
                          {renderFieldError('phone')}
                        </div>
                        <div className="grid gap-1.5">
                          <Label>رقم هاتف بديل</Label>
                          <Input value={form.phone_secondary} onChange={e => setField('phone_secondary', e.target.value)} placeholder="01112345678" className={fieldClassName('phone_secondary')} />
                          {renderFieldError('phone_secondary')}
                        </div>
                        <div className="grid gap-1.5 sm:col-span-2">
                          <Label>رابط الموقع الدقيق</Label>
                          <Input
                            value={form.location_link}
                            onChange={e => setField('location_link', e.target.value)}
                            placeholder="الصق رابط Google Maps أو Waze للموقع الدقيق"
                            className={fieldClassName('location_link')}
                          />
                          <p className="text-xs text-muted-foreground">هذا الرابط سيُستخدم في QR الخاص بالفاتورة بدل تخمين العنوان النصي.</p>
                          {renderFieldError('location_link')}
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">العنوان التفصيلي</p>
                            <p className="text-sm text-muted-foreground">التقسيم التفصيلي يقلل أخطاء التوصيل ويُسرّع البحث لاحقًا.</p>
                          </div>
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        {renderAddressFields()}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 bg-muted/20 shadow-none">
                    <CardContent className="grid gap-4 p-4">
                      <div>
                        <p className="text-lg font-bold text-foreground">تنبيه التكرار المباشر</p>
                        <p className="text-sm text-muted-foreground">أثناء الكتابة نتحقق من نفس البراند لتجنب تسجيل العميل مرتين.</p>
                      </div>
                      {duplicateMatches.length > 0 ? (
                        <div className="space-y-3">
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                            هذا العميل مسجل بالفعل. يمكنك استخدام بياناته مباشرة بدل إنشاء سجل مكرر.
                          </div>
                          {duplicateMatches.map(customer => (
                            <button
                              key={customer.id}
                              type="button"
                              onClick={() => {
                                setCustomerMode('existing');
                                setCustomerFromRecord(customer);
                              }}
                              className="w-full rounded-2xl border bg-background p-4 text-right transition hover:border-primary hover:shadow-md"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-semibold text-foreground">{customer.name}</p>
                                  <p className="text-sm text-muted-foreground">{customer.phone}</p>
                                </div>
                                <Badge variant="outline">{customer.order_count} طلب</Badge>
                              </div>
                              <p className="mt-3 text-sm text-muted-foreground">{customer.address || 'لا يوجد عنوان محفوظ'}</p>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed bg-background px-4 py-10 text-center text-sm text-muted-foreground">
                          لا يوجد تطابق واضح حتى الآن. استمر في إدخال البيانات ثم انتقل لتفاصيل الأوردر.
                        </div>
                      )}
                      <div className="rounded-2xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                        العنوان النهائي: {addressPreview || 'أكمل حقول العنوان ليظهر الملخص هنا'}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {step === 'order' && (
                <div className="grid gap-4 lg:grid-cols-[1fr_0.92fr]">
                  <Card className="border-0 bg-[linear-gradient(180deg,rgba(255,255,255,1),rgba(247,249,248,1))] shadow-sm">
                    <CardContent className="grid gap-4 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-foreground">تفاصيل الأوردر</p>
                          <p className="text-sm text-muted-foreground">أكمل الحجز بسرعة، مع التحقق التلقائي من التاريخ والسعر.</p>
                        </div>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">الخطوة الأخيرة</Badge>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                          <Label htmlFor="execution-date">تاريخ التنفيذ *</Label>
                          <Input id="execution-date" type="date" min={todayDate} value={form.execution_date} onChange={e => handleExecutionDateChange(e.target.value)} className={fieldClassName('execution_date')} />
                          {renderFieldError('execution_date')}
                        </div>
                        <div className="grid gap-1.5">
                          <Label>اليوم</Label>
                          <Input value={form.execution_day} readOnly disabled className={fieldClassName('execution_day')} />
                          {renderFieldError('execution_day')}
                        </div>
                      </div>

                      <div className="grid gap-3">
                        <div className="grid gap-2">
                          <Label>نوع الطلب *</Label>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {(Object.entries(ORDER_MODE_LABELS) as [OrderMode, string][]).map(([value, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => handleOrderModeChange(value)}
                                className={cn(
                                  'rounded-2xl border p-4 text-right transition',
                                  form.order_mode === value ? 'border-primary bg-primary/5 shadow-sm' : 'bg-background',
                                )}
                              >
                                <p className="font-semibold text-foreground">{label}</p>
                                <p className="text-sm text-muted-foreground">
                                  {value === 'package' ? 'اختيار سريع من الباقات الجاهزة لهذا البراند.' : 'اختيار وجبات مباشرة من المنيو الحالي.'}
                                </p>
                              </button>
                            ))}
                          </div>
                        </div>

                        {form.order_mode === 'package' ? (
                          <div className="grid gap-1.5">
                            <Label>الباقة *</Label>
                            <Select value={form.package_plan_id} onValueChange={handlePackagePlanChange}>
                              <SelectTrigger className={fieldClassName('package')}><SelectValue placeholder="اختر باقة" /></SelectTrigger>
                              <SelectContent>
                                {brandPackages.map(pkg => (
                                  <SelectItem key={pkg.id} value={pkg.id}>{pkg.name} - {pkg.days_count} يوم - {formatEGPCurrency(pkg.price)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {renderFieldError('package')}
                            {selectedPackagePlan && (
                              <div className="flex flex-wrap gap-2 rounded-2xl border bg-background p-3 text-xs text-muted-foreground">
                                {selectedPackagePlan.items.map(item => (
                                  <Badge key={item.id} variant={item.source === 'menu' ? 'secondary' : 'outline'}>{item.label}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="grid gap-1.5">
                            <Label>اختيار الوجبات *</Label>
                            <div className={cn('grid max-h-64 gap-2 overflow-y-auto rounded-2xl border p-3', fieldClassName('package'))}>
                              {brandMeals.map(meal => (
                                <label key={meal.id} className="flex items-start gap-3 rounded-2xl border bg-background px-3 py-3 cursor-pointer">
                                  <Checkbox checked={form.selected_meal_ids.includes(meal.id)} onCheckedChange={() => toggleSelectedMeal(meal.id)} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-foreground">{meal.name}</span>
                                      <Badge variant="outline">{MENU_CATEGORY_LABELS[meal.category]}</Badge>
                                      {meal.price !== null && <Badge variant="secondary">{formatEGPCurrency(meal.price)}</Badge>}
                                    </div>
                                    <p className="mt-1 text-xs text-muted-foreground">Protein {meal.protein}g | Carbs {meal.carbs}g | Fat {meal.fat}g | Calories {meal.calories}</p>
                                  </div>
                                </label>
                              ))}
                              {brandMeals.length === 0 && (
                                <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                                  لا توجد وجبات متاحة لهذا البراند في المنيو حاليًا.
                                </div>
                              )}
                            </div>
                            {renderFieldError('package')}
                          </div>
                        )}

                        {customizableMeals.length > 0 && (
                          <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4">
                            <div>
                              <p className="font-semibold text-foreground">تعديل على وجبة محددة</p>
                              <p className="text-sm text-muted-foreground">الملاحظة هنا تُطبّق على الوجبة المكتوبة فقط، وليس على كل الأوردر.</p>
                            </div>
                            <div className="grid gap-3">
                              {customizableMeals.map((meal) => (
                                <div key={meal.key} className="grid gap-1.5 rounded-2xl border bg-background p-3">
                                  <Label htmlFor={`meal-note-${meal.key}`}>{meal.label}</Label>
                                  <Textarea
                                    id={`meal-note-${meal.key}`}
                                    value={form.meal_customization_notes[meal.key] ?? ''}
                                    onChange={e => setMealCustomizationNote(meal.key, e.target.value)}
                                    placeholder="مثال: بدون رز، بدون صوص، زيادة خضار"
                                    rows={2}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="grid gap-1.5">
                          <Label>المصدر</Label>
                          <Select value={form.source} onValueChange={value => setField('source', value as OrderSource)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.entries(SOURCE_LABELS) as [OrderSource, string][]).map(([value, label]) => (
                                <SelectItem key={value} value={value}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid gap-1.5">
                        <Label>ملاحظات عامة على الأوردر</Label>
                        <Textarea value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="هذا التعديل سيُطبّق على كل وجبات الأوردر، إن أردت تعديل وجبة واحدة فقط استخدم الحقول بالأعلى..." rows={4} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 bg-muted/20 shadow-none">
                    <CardContent className="grid gap-4 p-4">
                      <div>
                        <p className="text-lg font-bold text-foreground">ملخص سريع قبل الحفظ</p>
                        <p className="text-sm text-muted-foreground">مراجعة سريعة لتقليل الأخطاء قبل تأكيد الأوردر.</p>
                      </div>

                      <div className="rounded-2xl border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-foreground">{form.customer_name || 'عميل جديد'}</p>
                            <p className="text-sm text-muted-foreground">{form.phone || 'أضف الهاتف'}</p>
                          </div>
                          <Badge variant="outline">{customerMode === 'existing' ? 'عميل قديم' : 'عميل جديد'}</Badge>
                        </div>
                        {form.phone_secondary && <p className="mt-3 text-sm text-muted-foreground">رقم بديل: {form.phone_secondary}</p>}
                        {form.location_link && <p className="mt-3 text-sm text-muted-foreground">الموقع الدقيق مرفق في QR</p>}
                        <p className="mt-3 text-sm text-muted-foreground">العنوان: {addressPreview || 'لا يوجد عنوان محدد'}</p>
                      </div>

                      <div className="rounded-2xl border bg-background p-4 text-sm">
                        <div className="flex items-center justify-between gap-3 border-b pb-3">
                          <span className="text-muted-foreground">نوع الاختيار</span>
                          <span className="font-semibold text-foreground">{ORDER_MODE_LABELS[form.order_mode]}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-b py-3">
                          <span className="text-muted-foreground">المحتوى المختار</span>
                          <span className="font-semibold text-foreground text-left">
                            {form.order_mode === 'package'
                              ? (selectedPackagePlan?.name || 'لم يتم الاختيار')
                              : (selectedMealNames.length > 0 ? selectedMealNames.join(' + ') : 'لم يتم اختيار وجبات')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 border-b py-3">
                          <span className="text-muted-foreground">التكلفة المتوقعة</span>
                          <span className="font-semibold text-foreground">
                            {estimatedPrice > 0 ? formatEGPCurrency(estimatedPrice) : 'حدد الباقة أو الوجبات'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3 pt-3">
                          <span className="text-muted-foreground">تاريخ التنفيذ</span>
                          <span className="font-semibold text-foreground">{form.execution_day} {form.execution_date}</span>
                        </div>
                        {mealCustomizations.length > 0 && (
                          <div className="border-t pt-3">
                            <p className="mb-2 text-muted-foreground">تعديلات الوجبات المحددة</p>
                            <div className="space-y-1.5 text-sm">
                              {mealCustomizations.map((item) => (
                                <div key={item.key} className="flex items-start justify-between gap-3">
                                  <span className="text-foreground">{item.label}</span>
                                  <span className="text-left text-muted-foreground">{item.notes}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {customerMode === 'existing' && addressMode === 'new' && (
                        <label className="flex items-center gap-2 rounded-2xl border border-dashed bg-background px-4 py-3 text-sm text-muted-foreground">
                          <input type="checkbox" checked={saveNewAddressAsDefault} onChange={e => setSaveNewAddressAsDefault(e.target.checked)} />
                          حفظ العنوان الجديد في بيانات العميل أيضًا
                        </label>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            <div className="shrink-0 flex flex-col gap-3 border-t bg-muted/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-4">
              <p className="text-xs text-muted-foreground">
                {step === 'mode' && 'ابدأ باختيار البراند ونوع العميل.'}
                {step === 'customer' && 'الهدف هنا تقليل الكتابة اليدوية ومنع التكرار.'}
                {step === 'order' && 'راجع الملخص واضغط إنشاء الطلب عندما تصبح البيانات جاهزة.'}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                {step !== 'mode' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (step === 'order') {
                        setStep('customer');
                      } else {
                        setStep('mode');
                      }
                    }}
                  >
                    <ArrowRight className="h-4 w-4" /> رجوع
                  </Button>
                )}
                {step === 'customer' && (
                  <Button type="button" onClick={handleCustomerContinue} disabled={creating}>
                    التالي: تفاصيل الأوردر <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                {step === 'order' && (
                  <Button type="submit" disabled={creating} className="min-w-[180px]">
                    {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إنشاء الطلب الآن'}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerTrigger asChild>
          {triggerButton}
        </DrawerTrigger>
        <DrawerContent className="h-[100dvh] max-h-[100dvh] rounded-t-[28px] border-0 bg-transparent p-0 shadow-none">
          <DrawerHeader className="sr-only">
            <DrawerTitle>إنشاء طلب جديد</DrawerTitle>
            <DrawerDescription>واجهة bottom sheet لتسجيل الطلبات من الموبايل.</DrawerDescription>
          </DrawerHeader>
          <div className="h-full overflow-hidden">
            {surfaceContent}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {triggerButton}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] overflow-hidden border-0 bg-transparent p-0 shadow-none sm:h-[min(88dvh,56rem)] sm:w-[min(92vw,64rem)] sm:max-w-[64rem] sm:max-h-[min(88dvh,56rem)]">
        {surfaceContent}
      </DialogContent>
    </Dialog>
  );
}