import { formatArabicDate, getArabicWeekday, getTodayDateValue } from '@/lib/utils';

export type PurchaseShortageItem = {
  id: string;
  name: string;
  code?: string;
  purchaseUnit: string;
  usageUnit: string;
  onHand: number;
  minStock: number;
  lastPrice?: number;
};

type Props = {
  hubName?: string;
  purchaserName?: string;
  shortages: PurchaseShortageItem[];
  date?: string;
  blankRowsCount?: number;
  isPreview?: boolean;
};

export default function PurchaseOrderPrintSheet({
  hubName,
  purchaserName,
  shortages,
  date,
  blankRowsCount = 8,
  isPreview = false,
}: Props) {
  const today = date ?? getTodayDateValue();
  const weekday = getArabicWeekday(today);
  const formattedDate = formatArabicDate(today);

  // If there are no shortages, provide at least 15 blank rows for manual entry
  const effectiveBlankCount = shortages.length === 0 ? Math.max(15, blankRowsCount) : blankRowsCount;
  const blankRows = Array.from({ length: effectiveBlankCount });

  return (
    <div
      className={
        isPreview
          ? 'purchase-order-print-view bg-white text-[#111827] p-8 rounded-lg border shadow-sm max-w-4xl mx-auto'
          : 'purchase-order-print hidden print:block'
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
          .purchase-order-print, .purchase-order-print * {
            visibility: visible;
          }
          .purchase-order-print {
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
        .po-print-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          border-bottom: 2px solid #111827;
          padding-bottom: 8px;
          margin-bottom: 10px;
        }
        .po-print-title {
          font-size: 20px;
          font-weight: 700;
          margin: 0;
          color: #111827;
        }
        .po-print-meta {
          font-size: 12px;
          color: #374151;
          margin-top: 4px;
        }
        .po-print-info-bar {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #1f2937;
          margin-bottom: 10px;
          padding: 6px 10px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
        }
        .po-print-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          background: #ffffff;
        }
        .po-print-table th, .po-print-table td {
          border: 1px solid #4b5563;
          padding: 6px 8px;
          font-size: 11px;
        }
        .po-print-table th {
          background: #f9fafb;
          font-weight: 700;
          color: #111827;
          text-align: center;
        }
        /* سطور واضحة ومريحة للكتابة اليدوية */
        .po-print-table td {
          height: 33px;
        }
        .po-col-num {
          width: 5%;
          text-align: center;
        }
        .po-col-item {
          width: 28%;
          text-align: right;
        }
        .po-col-unit {
          width: 9%;
          text-align: center;
        }
        .po-col-stock {
          width: 11%;
          text-align: center;
          font-family: monospace;
          background: #fdfdfd;
        }
        .po-col-min {
          width: 11%;
          text-align: center;
          font-family: monospace;
          background: #fdfdfd;
        }
        .po-col-qty {
          width: 14%;
          text-align: center;
        }
        .po-col-price {
          width: 11%;
          text-align: center;
        }
        .po-col-notes {
          width: 11%;
          text-align: right;
        }
        .po-print-footer {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          margin-top: 20px;
          font-size: 11px;
        }
        .po-print-sign {
          flex: 1;
          border-top: 1px solid #4b5563;
          padding-top: 8px;
          text-align: center;
          font-weight: 600;
        }
        .po-print-hint {
          margin-top: 10px;
          font-size: 10px;
          color: #4b5563;
          line-height: 1.5;
        }
      `}</style>

      {/* Header */}
      <div className="po-print-header">
        <div>
          <h1 className="po-print-title">طلب مشتريات</h1>
          <p className="po-print-meta">
            {hubName || 'المخزن المركزي'} — {weekday} {formattedDate}
          </p>
        </div>
        <div className="po-print-meta text-left">
          <div>أصناف النواقص المقترحة: {shortages.length}</div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="po-print-info-bar">
        <div><strong>مسؤول المشتريات:</strong> {purchaserName || '....................................'}</div>
        <div><strong>المورد المقترح:</strong> ....................................</div>
        <div><strong>تاريخ الشراء:</strong> {today}</div>
      </div>

      {/* Table */}
      <table className="po-print-table">
        <thead>
          <tr>
            <th className="po-col-num">م</th>
            <th className="po-col-item">اسم الصنف</th>
            <th className="po-col-unit">الوحدة</th>
            <th className="po-col-stock">الرصيد المتاح</th>
            <th className="po-col-min">حد الطلب</th>
            <th className="po-col-qty">الكمية المشتراة</th>
            <th className="po-col-price">سعر الوحدة</th>
            <th className="po-col-notes">المورد / ملاحظات</th>
          </tr>
        </thead>
        <tbody>
          {/* Pre-populated shortage items for reminder */}
          {shortages.map((item, index) => (
            <tr key={item.id}>
              <td className="po-col-num font-mono">{index + 1}</td>
              <td className="po-col-item font-semibold">
                {item.name}
                {item.code ? ` (${item.code})` : ''}
              </td>
              <td className="po-col-unit">{item.purchaseUnit}</td>
              <td className="po-col-stock font-bold">
                {item.onHand} {item.usageUnit}
              </td>
              <td className="po-col-min text-slate-600">
                {item.minStock} {item.usageUnit}
              </td>
              {/* سطر لكتابة الكمية المشتراة فعلياً */}
              <td className="po-col-qty"></td>
              {/* سطر لكتابة سعر الوحدة الفعلي */}
              <td className="po-col-price"></td>
              {/* سطر لكتابة المورد أو الملاحظات */}
              <td className="po-col-notes"></td>
            </tr>
          ))}

          {/* Blank ruled rows for handwriting any additional or needed items */}
          {blankRows.map((_, i) => (
            <tr key={`blank-${i}`}>
              <td className="po-col-num text-slate-400 font-mono">{shortages.length + i + 1}</td>
              {/* سطر لكتابة اسم الصنف بخط اليد */}
              <td className="po-col-item"></td>
              {/* سطر لكتابة الوحدة بخط اليد */}
              <td className="po-col-unit"></td>
              <td className="po-col-stock text-slate-300">-</td>
              <td className="po-col-min text-slate-300">-</td>
              {/* سطر لكتابة الكمية المشتراة */}
              <td className="po-col-qty"></td>
              {/* سطر لكتابة سعر الوحدة */}
              <td className="po-col-price"></td>
              {/* سطر لكتابة المورد والملاحظات */}
              <td className="po-col-notes"></td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="po-print-hint">
        * الأصناف المدرجة أعلاه تلقائياً هي نواقص المخزن المسجلة للتذكير. بمجرد تدوين الكمية والسعر يعتبر قد تم شراؤها فعلياً. يمكن كتابة أي أصناف أخرى ناقصة أو مطلوبة بخط اليد في الخانات الفارغة.
      </p>

      <div className="po-print-footer">
        <div className="po-print-sign">مسؤول المشتريات (المشتري)</div>
        <div className="po-print-sign">أمين المخزن (الاستلام)</div>
        <div className="po-print-sign">الاعتماد المالي</div>
      </div>
    </div>
  );
}
