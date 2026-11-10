import { formatArabicDate, getArabicWeekday, getTodayDateValue } from '@/lib/utils';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

type Props = {
  hubName: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  date?: string;
  shift?: string;
  categoryFilter?: string;
  sheetType?: 'filled' | 'blank';
  blankRowsCount?: number;
  isPreview?: boolean;
};

export default function WithdrawalSheetPrintSheet({
  hubName,
  items,
  categories,
  date,
  shift = 'اليوم بالكامل',
  categoryFilter = 'all',
  sheetType = 'filled',
  blankRowsCount = 6,
  isPreview = false,
}: Props) {
  const today = date ?? getTodayDateValue();
  const weekday = getArabicWeekday(today);
  const formattedDate = formatArabicDate(today);
  const categoryNameByCode = new Map(categories.map((category) => [category.code, category.name_ar]));

  const filteredItems = items
    .filter((item) => item.status === 'active')
    .filter((item) => categoryFilter === 'all' || item.category === categoryFilter)
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name, 'ar'));

  const blankRows = Array.from({ length: Math.max(0, blankRowsCount) });

  return (
    <div
      className={
        isPreview
          ? 'withdrawal-sheet-view bg-white text-slate-900 p-6 md:p-8 rounded-xl border shadow-sm max-w-4xl mx-auto'
          : 'withdrawal-sheet-print hidden print:block'
      }
      dir="rtl"
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          .withdrawal-sheet-print, .withdrawal-sheet-print * {
            visibility: visible;
          }
          .withdrawal-sheet-print {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 4mm;
            color: #0f172a !important;
            background: #ffffff !important;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 11px;
            display: block !important;
          }
          .withdrawal-sheet-card {
            border: 1.5px solid #0f172a;
          }
        }
      `}</style>

      {/* Header */}
      <div className="border-b-2 border-slate-900 pb-3 mb-3 text-right">
        {/* Main Title */}
        <div className="text-center border-b pb-2 mb-2.5">
          <h1 className="text-2xl font-black tracking-tight text-slate-950 inline-block border-b-2 border-slate-900 pb-1">
            ورقة مسحوبات المخزن والمطبخ اليومية
          </h1>
          <p className="text-xs text-slate-600 mt-1 font-semibold">
            {hubName || 'المخزن المركزي'} — سجل خروج واستهلاك الخامات للمطبخ والتشغيل
          </p>
        </div>

        {/* Info Grid for Handwriting / Meta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 print:bg-transparent p-2 rounded-lg border border-slate-300">
          <div>
            <span className="text-slate-600 font-bold block text-[11px]">التاريخ:</span>
            <span className="font-mono font-bold text-slate-900">{weekday} {formattedDate}</span>
          </div>
          <div>
            <span className="text-slate-600 font-bold block text-[11px]">الوردية:</span>
            <span className="font-semibold text-slate-900">{shift}</span>
          </div>
          <div>
            <span className="text-slate-600 font-bold block text-[11px]">أمين المخزن (المسلّم):</span>
            <span className="block border-b border-dashed border-slate-500 w-full h-4 mt-0.5"></span>
          </div>
          <div>
            <span className="text-slate-600 font-bold block text-[11px]">شيف المطبخ (المستلم):</span>
            <span className="block border-b border-dashed border-slate-500 w-full h-4 mt-0.5"></span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full border-collapse border-2 border-slate-800 text-xs table-fixed mb-3">
        <thead>
          <tr className="bg-slate-200 text-slate-950 border-b-2 border-slate-800 font-black text-center">
            <th className="border border-slate-700 p-2 w-[5%]">م</th>
            <th className="border border-slate-700 p-2 w-[27%] text-right">اسم الصنف</th>
            <th className="border border-slate-700 p-2 w-[9%]">الوحدة</th>
            <th className="border border-slate-700 p-2 w-[12%] bg-slate-300/60">رصيد المخزن المتاح</th>
            <th className="border-2 border-slate-950 p-2 w-[16%] bg-amber-50 print:bg-transparent text-sm">
              الكمية المسحوبة <span className="block text-[10px] font-normal text-slate-600">(اكتب الرقم هنا)</span>
            </th>
            <th className="border border-slate-700 p-2 w-[16%] bg-slate-100">
              الرصيد المتبقي الفعلي <span className="block text-[10px] font-normal text-slate-500">(اختياري)</span>
            </th>
            <th className="border border-slate-700 p-2 w-[15%]">ملاحظات / سبب الصرف</th>
          </tr>
        </thead>
        <tbody>
          {sheetType === 'blank' ? (
            /* Full blank ruled lines */
            Array.from({ length: 18 }).map((_, i) => (
              <tr key={`blank-full-${i}`} className="border-b border-slate-400 h-10">
                <td className="border border-slate-400 p-1.5 text-center font-mono text-slate-500">{i + 1}</td>
                <td className="border border-slate-400 p-1.5 border-b border-slate-300"></td>
                <td className="border border-slate-400 p-1.5"></td>
                <td className="border border-slate-400 p-1.5 bg-slate-50 print:bg-transparent"></td>
                <td className="border-2 border-slate-950 p-1.5 bg-white text-center font-mono font-bold text-base"></td>
                <td className="border border-slate-400 p-1.5 bg-white text-center font-mono"></td>
                <td className="border border-slate-400 p-1.5"></td>
              </tr>
            ))
          ) : (
            <>
              {filteredItems.map((item, index) => {
                const previous = filteredItems[index - 1];
                const showCategory = !previous || previous.category !== item.category;
                const catName = categoryNameByCode.get(item.category) ?? item.category;

                return (
                  <>
                    {showCategory && (
                      <tr key={`cat-${item.category}`} className="bg-slate-200/90 font-black text-slate-900 border-b border-slate-500">
                        <td colSpan={7} className="border border-slate-500 px-3 py-1.5 text-xs">
                          📂 قسم: {catName}
                        </td>
                      </tr>
                    )}
                    <tr key={item.id} className="hover:bg-slate-50 border-b border-slate-400 h-10">
                      <td className="border border-slate-400 p-1.5 text-center font-mono font-bold text-slate-700">
                        {index + 1}
                      </td>
                      <td className="border border-slate-400 p-1.5 font-bold text-slate-950 text-right">
                        <div>{item.name}</div>
                        {item.code && <div className="text-[10px] font-normal text-slate-500">{item.code}</div>}
                      </td>
                      <td className="border border-slate-400 p-1.5 text-center font-semibold text-slate-800">
                        {item.unit}
                      </td>
                      <td className="border border-slate-400 p-1.5 text-center font-mono font-bold bg-slate-100/70 print:bg-transparent text-slate-900">
                        {item.availableQuantity.toLocaleString('ar-EG', { maximumFractionDigits: 3 })}
                      </td>
                      {/* Space to write withdrawn quantity */}
                      <td className="border-2 border-slate-950 p-1.5 bg-white text-center font-mono font-bold text-base">
                        {/* Ruled space for handwriting */}
                      </td>
                      {/* Space to write remaining quantity (optional) */}
                      <td className="border border-slate-400 p-1.5 bg-white text-center font-mono">
                        {/* Ruled space for handwriting */}
                      </td>
                      {/* Notes / Reason */}
                      <td className="border border-slate-400 p-1.5 text-slate-500 text-[11px]">
                        {/* Ruled space for handwriting */}
                      </td>
                    </tr>
                  </>
                );
              })}

              {/* Blank extra rows for ad-hoc / unlisted kitchen withdrawals */}
              {blankRows.length > 0 && (
                <>
                  <tr className="bg-slate-200 font-bold text-slate-700 border-b border-slate-500">
                    <td colSpan={7} className="border border-slate-500 px-3 py-1 text-[11px] text-center">
                      ✏️ أسطر فارغة لكتابة أي أصناف مسحوبة إضافية غير مسجلة أعلاه
                    </td>
                  </tr>
                  {blankRows.map((_, i) => (
                    <tr key={`blank-${i}`} className="border-b border-slate-400 h-10">
                      <td className="border border-slate-400 p-1.5 text-center text-slate-400 font-mono text-xs">
                        {filteredItems.length + i + 1}
                      </td>
                      <td className="border border-slate-400 p-1.5"></td>
                      <td className="border border-slate-400 p-1.5"></td>
                      <td className="border border-slate-400 p-1.5 bg-slate-100/50"></td>
                      <td className="border-2 border-slate-950 p-1.5 bg-white"></td>
                      <td className="border border-slate-400 p-1.5 bg-white"></td>
                      <td className="border border-slate-400 p-1.5"></td>
                    </tr>
                  ))}
                </>
              )}
            </>
          )}
        </tbody>
      </table>

      {/* Smart OCR Instructions */}
      <div className="bg-emerald-50 print:bg-slate-50 border border-emerald-300 print:border-slate-400 p-2.5 rounded-lg text-slate-800 text-[10.5px] leading-relaxed mb-4">
        <div className="font-bold flex items-center gap-1.5 text-emerald-800 print:text-slate-900 mb-1">
          <span>📸</span>
          <span>طريقة تدوين ورفع الورقة لخصم المسحوبات آليًا:</span>
        </div>
        <ol className="list-decimal list-inside space-y-0.5 text-slate-700">
          <li>دوّن الكميات المسحوبة بالأرقام بوضوح داخل خانة <strong>«الكمية المسحوبة»</strong> فور الصرف.</li>
          <li>عند انتهاء اليوم أو الوردية، التقط صورة عمودية واضحة للورقة بإضاءة جيدة.</li>
          <li>
            افتح صفحة <strong>إدارة المخزون</strong> واضغط على زر <strong>«سحب من المخزن»</strong> ثم اختر تبويب <strong>«صورة»</strong> وارفع صورة هذه الورقة ليتم قراءتها وخصمها آليًا من أرصدة المخزن.
          </li>
        </ol>
      </div>

      {/* Official Signatures */}
      <div className="grid grid-cols-3 gap-4 border-t-2 border-slate-900 pt-3 text-xs text-slate-800">
        <div className="text-center">
          <p className="font-bold mb-6">مسؤول تسليم المخزن</p>
          <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
          <p className="text-[10px] text-slate-500">الاسم والتوقيع</p>
        </div>
        <div className="text-center">
          <p className="font-bold mb-6">شيف / مستلم المطبخ</p>
          <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
          <p className="text-[10px] text-slate-500">الاسم والتوقيع</p>
        </div>
        <div className="text-center">
          <p className="font-bold mb-6">اعتماد مدير التشغيل</p>
          <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
          <p className="text-[10px] text-slate-500">الاعتماد والتاريخ</p>
        </div>
      </div>
    </div>
  );
}
