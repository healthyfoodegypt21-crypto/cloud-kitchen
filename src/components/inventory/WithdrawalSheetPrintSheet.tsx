import { formatArabicDate, getArabicWeekday, getTodayDateValue } from '@/lib/utils';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

type Props = {
  hubName: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  date?: string;
  isPreview?: boolean;
};

export default function WithdrawalSheetPrintSheet({
  hubName,
  items,
  categories,
  date,
  isPreview = false,
}: Props) {
  const today = date ?? getTodayDateValue();
  const weekday = getArabicWeekday(today);
  const formattedDate = formatArabicDate(today);
  const categoryNameByCode = new Map(categories.map((category) => [category.code, category.name_ar]));

  const activeItems = items
    .filter((item) => item.status === 'active')
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name, 'ar'));

  const blankRows = Array.from({ length: 8 });

  return (
    <div
      className={
        isPreview
          ? 'withdrawal-sheet-view bg-white text-[#111827] p-8 rounded-lg border shadow-sm max-w-4xl mx-auto'
          : 'withdrawal-sheet-print hidden print:block'
      }
      dir="rtl"
    >
      <style>{`
        @page {
          size: A4 portrait;
          margin: 10mm;
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
            padding: 0;
            color: #111827 !important;
            background: #ffffff !important;
            font-family: Arial, sans-serif;
            font-size: 11px;
            display: block !important;
          }
        }
        .withdrawal-sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-bottom: 2px solid #111827;
          padding-bottom: 8px;
          margin-bottom: 12px;
        }
        .withdrawal-sheet-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          color: #111827;
        }
        .withdrawal-sheet-meta {
          font-size: 12px;
          color: #374151;
          margin-top: 4px;
        }
        .withdrawal-sheet-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          background: #ffffff;
        }
        .withdrawal-sheet-table th, .withdrawal-sheet-table td {
          border: 1px solid #4b5563;
          padding: 6px 8px;
          font-size: 11px;
        }
        .withdrawal-sheet-table th {
          background: #f9fafb;
          font-weight: 700;
          color: #111827;
          text-align: center;
        }
        /* سطور مريحة للكتابة اليدوية */
        .withdrawal-sheet-table td {
          height: 34px;
        }
        .withdrawal-sheet-num {
          width: 6%;
          text-align: center;
        }
        .withdrawal-sheet-item {
          width: 28%;
          text-align: right;
          font-weight: 600;
        }
        .withdrawal-sheet-unit {
          width: 9%;
          text-align: center;
        }
        .withdrawal-sheet-current {
          width: 12%;
          text-align: center;
          font-family: monospace;
          font-weight: 600;
        }
        .withdrawal-sheet-qty {
          width: 15%;
          text-align: center;
          background: #ffffff;
        }
        .withdrawal-sheet-remaining {
          width: 15%;
          text-align: center;
          background: #ffffff;
        }
        .withdrawal-sheet-notes {
          width: 15%;
          background: #ffffff;
        }
        .withdrawal-sheet-category td {
          background: #f3f4f6;
          font-weight: 700;
          height: auto;
          padding: 4px 8px;
        }
        .withdrawal-sheet-footer {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 24px;
          font-size: 11px;
        }
        .withdrawal-sheet-sign {
          flex: 1;
          border-top: 1px solid #4b5563;
          padding-top: 8px;
          text-align: center;
          font-weight: 600;
        }
        .withdrawal-sheet-hint {
          margin-top: 10px;
          font-size: 10px;
          color: #4b5563;
          line-height: 1.5;
        }
      `}</style>

      {/* Header */}
      <div className="withdrawal-sheet-header">
        <div>
          <h1 className="withdrawal-sheet-title">ورقة مسحوبات</h1>
          <p className="withdrawal-sheet-meta">
            {hubName || 'المخزن المركزي'} — {weekday} {formattedDate}
          </p>
        </div>
        <div className="withdrawal-sheet-meta text-left">
          <div>عدد الأصناف: {activeItems.length}</div>
        </div>
      </div>

      {/* Table with clear headers and lined rows for writing */}
      <table className="withdrawal-sheet-table">
        <thead>
          <tr>
            <th className="withdrawal-sheet-num">م</th>
            <th className="withdrawal-sheet-item">اسم الصنف</th>
            <th className="withdrawal-sheet-unit">الوحدة</th>
            <th className="withdrawal-sheet-current">الرصيد الحالي</th>
            <th className="withdrawal-sheet-qty">الكمية المسحوبة</th>
            <th className="withdrawal-sheet-remaining">الرصيد الفعلي المتبقي</th>
            <th className="withdrawal-sheet-notes">ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {activeItems.map((item, index) => {
            const previous = activeItems[index - 1];
            const showCategory = !previous || previous.category !== item.category;
            return (
              <>
                {showCategory && (
                  <tr key={`cat-${item.category}`} className="withdrawal-sheet-category">
                    <td colSpan={7}>{categoryNameByCode.get(item.category) ?? item.category}</td>
                  </tr>
                )}
                <tr key={item.id}>
                  <td className="withdrawal-sheet-num">{index + 1}</td>
                  <td className="withdrawal-sheet-item">
                    {item.name}
                    {item.code ? ` (${item.code})` : ''}
                  </td>
                  <td className="withdrawal-sheet-unit">{item.unit}</td>
                  <td className="withdrawal-sheet-current">
                    {item.availableQuantity.toLocaleString('ar-EG', { maximumFractionDigits: 3 })}
                  </td>
                  {/* سطر لكتابة الكمية المسحوبة */}
                  <td className="withdrawal-sheet-qty"></td>
                  {/* سطر لكتابة الرصيد الفعلي المتبقي */}
                  <td className="withdrawal-sheet-remaining"></td>
                  {/* سطر لكتابة الملاحظات */}
                  <td className="withdrawal-sheet-notes"></td>
                </tr>
              </>
            );
          })}

          {/* سطور فارغة للكتابة اليدوية لأي صنف إضافي */}
          {blankRows.map((_, i) => (
            <tr key={`blank-${i}`}>
              <td className="withdrawal-sheet-num text-slate-400">{activeItems.length + i + 1}</td>
              <td className="withdrawal-sheet-item"></td>
              <td className="withdrawal-sheet-unit"></td>
              <td className="withdrawal-sheet-current"></td>
              <td className="withdrawal-sheet-qty"></td>
              <td className="withdrawal-sheet-remaining"></td>
              <td className="withdrawal-sheet-notes"></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="withdrawal-sheet-hint">
        * يتم تدوين «الكمية المسحوبة» فور خروجها من المخزن. خانة «الرصيد الفعلي المتبقي» اختيارية (إذا تُرِكت فارغة يحسبها النظام تلقائياً، وإذا كُتِبت يقارنها النظام بالرصيد لاكتشاف أي فرق أو هدر).
      </p>

      <div className="withdrawal-sheet-footer">
        <div className="withdrawal-sheet-sign">توقيع مسؤول المخزن</div>
        <div className="withdrawal-sheet-sign">توقيع المستلم</div>
        <div className="withdrawal-sheet-sign">المراجعة والاعتماد</div>
      </div>
    </div>
  );
}
