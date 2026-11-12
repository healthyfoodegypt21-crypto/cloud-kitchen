import { useState } from 'react';
import { ImagePlus, MessageSquareText, Sparkles, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Props = {
  displayName: string;
  onStartImport: (source: 'message' | 'image') => void;
};

export default function PurchasesAssistant({ displayName, onStartImport }: Props) {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <section
      dir="rtl"
      className="rounded-xl border border-emerald-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]"
      aria-labelledby="purchases-assistant-title"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-emerald-200/80 bg-emerald-50 flex items-center justify-center">
            <img
              src="/images/allie-purchases.png"
              alt="Allie"
              className="h-10 w-10 object-contain"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id="purchases-assistant-title" className="text-sm font-bold text-slate-900">
                {displayName ? `أهلًا ${displayName} — استيراد ذكي عبر Allie` : 'استيراد الفواتير الذكي عبر Allie'}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <Sparkles className="h-3 w-3" />
                تحليل تلقائي + كشف تغيّر الأسعار
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              حوّل رسالة المورد النصية أو صورة الفاتورة مباشرةً إلى مسودة شراء جاهزة للمراجعة ومربوطة بأصناف المخزن.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            onClick={() => onStartImport('message')}
          >
            <MessageSquareText className="h-3.5 w-3.5" />
            <span>ألصق رسالة المورد</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 rounded-lg text-xs font-semibold"
            onClick={() => onStartImport('image')}
          >
            <ImagePlus className="h-3.5 w-3.5 text-emerald-600" />
            <span>ارفع صورة فاتورة</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-9 gap-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900"
            aria-expanded={showGuide}
            onClick={() => setShowGuide((current) => !current)}
          >
            <WandSparkles className="h-3.5 w-3.5" />
            <span>{showGuide ? 'إخفاء الخطوات' : 'الخطوات'}</span>
          </Button>
        </div>
      </div>

      {showGuide ? (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-xs sm:grid-cols-3">
          <GuideStep number="1" title="أرسل المصدر" description="الصق رسالة واتساب أو اختر صورة واضحة للفاتورة." />
          <GuideStep number="2" title="راجع التفاصيل" description="طابق الأصناف وتأكد من الوحدات والكميات والأسعار." />
          <GuideStep number="3" title="أكمل الاستلام" description="أرسل الشراء للمخزن؛ يُضاف الرصيد بعد اعتماد الاستلام." />
        </div>
      ) : null}
    </section>
  );
}

function GuideStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-slate-50/80 border border-slate-200/60 p-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-emerald-600 text-[11px] font-bold text-white tabular-nums">
        {number}
      </span>
      <div>
        <div className="font-semibold text-slate-800">{title}</div>
        <p className="mt-0.5 leading-relaxed text-slate-500">{description}</p>
      </div>
    </div>
  );
}
