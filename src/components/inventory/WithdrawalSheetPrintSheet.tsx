import { formatArabicDate, getArabicWeekday, getTodayDateValue } from '@/lib/utils';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';

type Props = {
  hubName: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  date?: string;
};

export default function WithdrawalSheetPrintSheet({ hubName, items, categories, date }: Props) {
  const today = date ?? getTodayDateValue();
  const weekday = getArabicWeekday(today);
  const formattedDate = formatArabicDate(today);
  const categoryNameByCode = new Map(categories.map((category) => [category.code, category.name_ar]));

  const activeItems = items
    .filter((item) => item.status === 'active')
    .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name, 'ar'));

  return (
    <div className="withdrawal-sheet-print hidden print:block" dir="rtl">
      <style media="print">{`
        @page { size: A4 portrait; margin: 10mm; }
        .withdrawal-sheet-print { color: #111827; font-family: Arial, sans-serif; }
        .withdrawal-sheet-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
        .withdrawal-sheet-title { font-size: 18px; font-weight: 700; margin: 0; }
        .withdrawal-sheet-meta { font-size: 11px; color: #4b5563; margin-top: 4px; }
        .withdrawal-sheet-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .withdrawal-sheet-table th, .withdrawal-sheet-table td { border: 1px solid #9ca3af; padding: 4px 6px; font-size: 10.5px; }
        .withdrawal-sheet-table th { background: #f3f4f6; font-weight: 700; }
        .withdrawal-sheet-table td { height: 22px; }
        .withdrawal-sheet-num { width: 6%; text-align: center; }
        .withdrawal-sheet-item { width: 26%; }
        .withdrawal-sheet-unit { width: 9%; text-align: center; }
        .withdrawal-sheet-current { width: 12%; text-align: center; }
        .withdrawal-sheet-qty { width: 13%; }
        .withdrawal-sheet-remaining { width: 13%; }
        .withdrawal-sheet-notes { width: 21%; }
        .withdrawal-sheet-category td { background: #e5e7eb; font-weight: 700; height: auto; }
        .withdrawal-sheet-footer { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; font-size: 11px; }
        .withdrawal-sheet-sign { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; text-align: center; }
        .withdrawal-sheet-hint { margin-top: 8px; font-size: 9.5px; color: #6b7280; }
      `}</style>

      <div className="withdrawal-sheet-header">
        <div>
          <h1 className="withdrawal-sheet-title">ورقة مسحوبات المخزن</h1>
          <p className="withdrawal-sheet-meta">{hubName} — {weekday} {formattedDate}</p>
        </div>
        <div className="withdrawal-sheet-meta">عدد الأصناف: {activeItems.length}</div>
      </div>

      <table className="withdrawal-sheet-table">
        <thead>
          <tr>
            <th className="withdrawal-sheet-num">م</th>
            <th className="withdrawal-sheet-item">الصنف</th>
            <th className="withdrawal-sheet-unit">الوحدة</th>
            <th className="withdrawal-sheet-current">الرصيد الحالي</th>
            <th className="withdrawal-sheet-qty">الكمية المسحوبة</th>
            <th className="withdrawal-sheet-remaining">الكمية المتبقية</th>
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
                  <td className="withdrawal-sheet-item">{item.name}{item.code ? ` (${item.code})` : ''}</td>
                  <td className="withdrawal-sheet-unit">{item.unit}</td>
                  <td className="withdrawal-sheet-current">{item.availableQuantity.toLocaleString('ar-EG', { maximumFractionDigits: 3 })}</td>
                  <td className="withdrawal-sheet-qty" />
                  <td className="withdrawal-sheet-remaining" />
                  <td className="withdrawal-sheet-notes" />
                </tr>
              </>
            );
          })}
        </tbody>
      </table>

      <p className="withdrawal-sheet-hint">
        إذا لم تُكتب «الكمية المتبقية» سيحسبها النظام تلقائيًا (الرصيد الحالي − المسحوب). عند أول تسجيل لصنف تُعتبر الكمية المتبقية المكتوبة رصيد أول المدة. وعند وجود فرق بين المتبقي المكتوب وحساب النظام يظهر تنبيه خطأ/هدر عند الإدخال.
      </p>

      <div className="withdrawal-sheet-footer">
        <div className="withdrawal-sheet-sign">توقيع مسؤول المخزن</div>
        <div className="withdrawal-sheet-sign">توقيع المستلم</div>
        <div className="withdrawal-sheet-sign">المراجعة والاعتماد</div>
      </div>
    </div>
  );
}
