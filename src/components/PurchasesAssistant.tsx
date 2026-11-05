import { useState } from 'react';
import { ArrowLeft, ImagePlus, MessageSquareText, Sparkles, WandSparkles } from 'lucide-react';
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
      className="relative isolate overflow-hidden rounded-[1.75rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-lime-50 shadow-sm dark:border-emerald-950 dark:from-emerald-950/30 dark:via-card dark:to-lime-950/20"
      aria-labelledby="purchases-assistant-title"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-lime-200/30 blur-3xl dark:bg-lime-400/10" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-[38%] h-36 w-36 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-400/10" />

      <div className="relative grid items-center gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_230px] lg:gap-8 lg:p-8">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/80 px-3 py-1.5 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            Allie · مساعدتك في المشتريات
            <Sparkles className="h-3.5 w-3.5 text-lime-600 dark:text-lime-300" />
          </div>

          <div className="space-y-2">
            <h2 id="purchases-assistant-title" className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {displayName ? `أهلًا ${displayName}،` : 'أهلًا،'} خلّي Allie تساعدك!
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300 sm:text-base">
              رسالة المورد أو صورة الفاتورة تتحول لمسودة مشتريات مرتبة. راجع الأصناف والأسعار، وأنا أساعدك تكمّل الباقي.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              className="group h-11 gap-2 rounded-xl bg-emerald-700 px-5 font-bold text-white shadow-md shadow-emerald-900/10 transition hover:-translate-y-0.5 hover:bg-emerald-800 hover:shadow-lg dark:bg-emerald-600 dark:hover:bg-emerald-500"
              onClick={() => onStartImport('message')}
            >
              <MessageSquareText className="h-4 w-4" />
              ألصق رسالة المورد
              <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            </Button>
            <Button
              variant="outline"
              className="h-11 gap-2 rounded-xl border-emerald-200 bg-white/80 px-5 font-bold text-emerald-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100 dark:hover:bg-emerald-950/60"
              onClick={() => onStartImport('image')}
            >
              <ImagePlus className="h-4 w-4" />
              ارفع صورة فاتورة
            </Button>
            <Button
              variant="ghost"
              className="h-11 gap-2 rounded-xl px-4 font-semibold text-slate-600 hover:bg-white/70 hover:text-emerald-800 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-emerald-200"
              aria-expanded={showGuide}
              onClick={() => setShowGuide((current) => !current)}
            >
              <WandSparkles className="h-4 w-4" />
              {showGuide ? 'إخفاء المساعدة' : 'كيف تساعدني Allie؟'}
            </Button>
          </div>

          {showGuide ? (
            <div className="grid gap-3 rounded-2xl border border-emerald-100 bg-white/75 p-4 text-sm shadow-sm dark:border-emerald-950 dark:bg-card/70 sm:grid-cols-3">
              <GuideStep number="١" title="أرسل المصدر" description="الصق رسالة واتساب أو اختر صورة واضحة للفاتورة." />
              <GuideStep number="٢" title="راجع التفاصيل" description="طابق الأصناف وتأكد من الوحدات والكميات والأسعار." />
              <GuideStep number="٣" title="أكمل الاستلام" description="أرسل الشراء للمخزن؛ يُضاف الرصيد بعد اعتماد الاستلام." />
            </div>
          ) : null}
        </div>

        <div className="relative mx-auto flex w-full max-w-[190px] items-center justify-center lg:max-w-none">
          <div aria-hidden="true" className="absolute h-40 w-40 rounded-full bg-gradient-to-br from-lime-200/80 to-emerald-100/70 shadow-inner dark:from-lime-400/10 dark:to-emerald-400/10 sm:h-48 sm:w-48" />
          <div className="absolute -right-2 top-1 z-10 rounded-2xl rounded-br-sm border border-emerald-100 bg-white/95 px-3 py-2 text-xs font-bold text-emerald-800 shadow-md dark:border-emerald-900 dark:bg-card dark:text-emerald-200">
            أنا معاك! ✨
          </div>
          <img
            src="/images/allie-purchases.png"
            alt="Allie، مساعدتك المرحة في قسم المشتريات"
            className="allie-float relative z-0 h-auto w-40 drop-shadow-[0_16px_14px_rgba(16,90,54,0.17)] sm:w-48"
          />
          <span aria-hidden="true" className="absolute -bottom-1 left-5 z-10 rounded-full border border-emerald-100 bg-white/90 px-3 py-1 text-[11px] font-bold text-emerald-800 shadow-sm dark:border-emerald-900 dark:bg-card dark:text-emerald-200">
            صديقة المطبخ
          </span>
        </div>
      </div>
    </section>
  );
}

function GuideStep({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-sm font-extrabold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
        {number}
      </span>
      <div>
        <div className="font-bold text-slate-800 dark:text-slate-100">{title}</div>
        <p className="mt-0.5 leading-6 text-slate-600 dark:text-slate-400">{description}</p>
      </div>
    </div>
  );
}
