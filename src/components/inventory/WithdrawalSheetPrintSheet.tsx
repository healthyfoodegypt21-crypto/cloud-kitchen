import { formatArabicDate, getArabicWeekday, getTodayDateValue } from '@/lib/utils';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

type Props = {
  hubName: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  date?: string;
  shift?: string;
  categoryFilter?: string;
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
      <div className="border-b-2 border-slate-900 pb-3 mb-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-emerald-600 print:border print:border-black" />
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                ورقة مسحوبات المخزن والمطبخ اليومية
              </h1>
            </div>
            <p className="text-xs text-slate-600 mt-1 font-medium">
              سجل استهلاك وتشغيل المطبخ — {hubName || 'المخزن المركزي'}
            </p>
          </div>
          <div className="text-left font-mono text-xs text-slate-700 bg-slate-100 print:bg-transparent px-3 py-1.5 rounded-lg border border-slate-300">
            <div><strong>التاريخ:</strong> {weekday} {formattedDate}</div>
            <div><strong>الوردية:</strong> {shift}</div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-4 gap-2 mt-3 text-xs bg-slate-50 print:bg-slate-100 p-2 rounded-lg border border-slate-200">
          <div>
            <span className="text-slate-500 block text-[10px]">الموقع:</span>
            <strong className="text-slate-800">المخزن الرئيسي</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">عدد الأصناف:</span>
            <strong className="text-slate-800">{filteredItems.length} صنف</strong>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">أمين المخزن:</span>
            <span className="text-slate-400 block border-b border-dotted border-slate-400 w-24 h-4"></span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">شيف الاستلام:</span>
            <span className="text-slate-400 block border-b border-dotted border-slate-400 w-24 h-4"></span>
          </div>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full border-collapse border border-slate-400 text-xs table-fixed mb-3">
        <thead>
          <tr className="bg-slate-100 text-slate-900 border-b border-slate-400 font-bold">
            <th className="border border-slate-400 p-1.5 w-[5%] text-center">م</th>
            <th className="border border-slate-400 p-1.5 w-[14%] text-center">كود الصنف</th>
            <th className="border border-slate-400 p-1.5 w-[26%] text-right">اسم الصنف</th>
            <th className="border border-slate-400 p-1.5 w-[12%] text-center">القسم</th>
            <th className="border border-slate-400 p-1.5 w-[8%] text-center">الوحدة</th>
            <th className="border border-slate-400 p-1.5 w-[11%] text-center bg-slate-200/70">رصيد المخزن</th>
            <th className="border-2 border-slate-900 p-1.5 w-[12%] text-center bg-emerald-50 print:bg-transparent font-bold">الكمية المسحوبة</th>
            <th className="border border-slate-400 p-1.5 w-[12%] text-center">المتبقي الفعلي</th>
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((item, index) => {
            const previous = filteredItems[index - 1];
            const showCategory = !previous || previous.category !== item.category;
            const catName = categoryNameByCode.get(item.category) ?? item.category;

            return (
              <>
                {showCategory && (
                  <tr key={`cat-${item.category}`} className="bg-slate-200/80 font-bold text-slate-800">
                    <td colSpan={8} className="border border-slate-400 px-2 py-1 text-xs">
                      📂 {catName}
                    </td>
                  </tr>
                )}
                <tr key={item.id} className="hover:bg-slate-50 border-b border-slate-300">
                  <td className="border border-slate-300 p-1.5 text-center font-mono text-slate-600">
                    {index + 1}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono text-slate-500 text-[11px] truncate">
                    {item.code || '-'}
                  </td>
                  <td className="border border-slate-300 p-1.5 font-semibold text-slate-900">
                    {item.name}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center text-slate-600 text-[11px]">
                    {catName}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center font-medium text-slate-700">
                    {item.unit}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono font-semibold bg-slate-50 print:bg-transparent text-slate-800">
                    {item.availableQuantity.toLocaleString('ar-EG', { maximumFractionDigits: 3 })}
                  </td>
                  {/* Space to write withdrawn quantity */}
                  <td className="border-2 border-slate-900 p-1.5 bg-white text-center font-mono font-bold text-base h-8">
                    {/* Blank box for handwriting */}
                  </td>
                  {/* Space to write remaining quantity */}
                  <td className="border border-slate-300 p-1.5 bg-white text-center font-mono h-8">
                    {/* Blank box for handwriting */}
                  </td>
                </tr>
              </>
            );
          })}

          {/* Blank extra rows for ad-hoc / unlisted kitchen withdrawals */}
          {blankRows.length > 0 && (
            <>
              <tr className="bg-slate-100 font-bold text-slate-600">
                <td colSpan={8} className="border border-slate-400 px-2 py-1 text-[11px] text-center">
                  ✏️ أصناف إضافية مسحوبة (اكتب الصنف والكمية والوحدة بوضوح)
                </td>
              </tr>
              {blankRows.map((_, i) => (
                <tr key={`blank-${i}`} className="border-b border-slate-300">
                  <td className="border border-slate-300 p-1.5 text-center text-slate-400 font-mono text-xs">
                    {filteredItems.length + i + 1}
                  </td>
                  <td className="border border-slate-300 p-1.5 text-center text-slate-300">-</td>
                  <td className="border border-slate-300 p-1.5 h-8"></td>
                  <td className="border border-slate-300 p-1.5"></td>
                  <td className="border border-slate-300 p-1.5"></td>
                  <td className="border border-slate-300 p-1.5 bg-slate-50"></td>
                  <td className="border-2 border-slate-900 p-1.5 h-8"></td>
                  <td className="border border-slate-300 p-1.5 h-8"></td>
                </tr>
              ))}
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
