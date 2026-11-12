import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ChefHat,
  ClipboardList,
  Repeat,
  Search,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

export type CommandNavSection = {
  category: string;
  items: Array<{
    to: string;
    label: string;
    icon: React.ElementType;
  }>;
};

interface Props {
  sections: CommandNavSection[];
  canAccessOrders: boolean;
  canAccessCustomers: boolean;
  canAccessKitchen: boolean;
}

export default function GlobalCommandPalette({
  sections,
  canAccessOrders,
  canAccessCustomers,
  canAccessKitchen,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const runCommand = (target: string) => {
    setOpen(false);
    setQuery('');
    navigate(target);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="فتح البحث السريع"
        className="hidden md:inline-flex items-center gap-3 h-9 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200/80 text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <span>انتقال أو بحث سريع...</span>
        <kbd className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 tabular-nums">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="ابحث عن صفحة، إجراء تشغيلي، أو اكتب رقم هاتف عميل..."
        />
        <CommandList className="max-h-[360px] p-1.5">
          <CommandEmpty>
            {canAccessOrders && query.trim() ? (
              <button
                type="button"
                onClick={() => runCommand(`/orders?preset=all&q=${encodeURIComponent(query.trim())}`)}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 cursor-pointer"
              >
                <span>البحث في كل الطلبات عن "{query.trim()}"</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            ) : (
              <span className="text-xs text-slate-500">لا توجد نتائج مطابقة.</span>
            )}
          </CommandEmpty>

          {canAccessOrders && query.trim().length >= 2 && (
            <CommandGroup heading="بحث مباشر في الطلبات">
              <CommandItem
                value={`order-search-${query}`}
                onSelect={() => runCommand(`/orders?preset=all&q=${encodeURIComponent(query.trim())}`)}
                className="flex items-center justify-between gap-2 rounded-lg text-xs cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Search className="w-4 h-4 text-emerald-600" />
                  <span>عرض الطلبات المطابقة لـ "{query.trim()}"</span>
                </div>
                <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
              </CommandItem>
            </CommandGroup>
          )}

          {(canAccessOrders || canAccessCustomers || canAccessKitchen) && (
            <CommandGroup heading="اختصارات التشغيل السريعة">
              {canAccessOrders && (
                <CommandItem
                  value="طلبات معرضة للتأخير متأخرة"
                  onSelect={() => runCommand('/orders?delayed=1')}
                  className="flex items-center justify-between gap-2 rounded-lg text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>مراجعة الطلبات المعرضة للتأخير (+6 ساعات)</span>
                  </div>
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                </CommandItem>
              )}
              {canAccessOrders && (
                <CommandItem
                  value="الطلبات النشطة المفتوحة"
                  onSelect={() => runCommand('/orders?status=active')}
                  className="flex items-center justify-between gap-2 rounded-lg text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <ClipboardList className="w-4 h-4 text-emerald-600" />
                    <span>عرض كل الطلبات النشطة قيد التنفيذ</span>
                  </div>
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                </CommandItem>
              )}
              {canAccessKitchen && (
                <CommandItem
                  value="تجهيز المطبخ اليومي طباعة استيكرات"
                  onSelect={() => runCommand('/kitchen')}
                  className="flex items-center justify-between gap-2 rounded-lg text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <ChefHat className="w-4 h-4 text-slate-600" />
                    <span>فتح شاشة التجهيز اليومي للمطبخ</span>
                  </div>
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                </CommandItem>
              )}
              {canAccessCustomers && (
                <CommandItem
                  value="فرصة استرجاع عملاء معرضون للانقطاع"
                  onSelect={() => runCommand('/customers?segment=at_risk')}
                  className="flex items-center justify-between gap-2 rounded-lg text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Repeat className="w-4 h-4 text-sky-600" />
                    <span>فتح قائمة استرجاع العملاء غير النشطين</span>
                  </div>
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                </CommandItem>
              )}
            </CommandGroup>
          )}

          <CommandSeparator />

          {sections.map((section) => (
            <CommandGroup key={section.category} heading={section.category}>
              {section.items.map(({ to, label, icon: Icon }) => (
                <CommandItem
                  key={to}
                  value={`${section.category} ${label}`}
                  onSelect={() => runCommand(to)}
                  className="flex items-center justify-between gap-2 rounded-lg text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span>{label}</span>
                  </div>
                  <ArrowLeft className="w-3.5 h-3.5 text-slate-400" />
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
