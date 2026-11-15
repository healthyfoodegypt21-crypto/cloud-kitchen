import { CompanyAssemblyBlock } from '@/lib/kitchenOrderAssembly';

interface Props {
  companies: CompanyAssemblyBlock[];
  dateLabel: string;
  weekdayLabel?: string;
}

export default function KitchenOrderAssemblyPrintSheet({
  companies,
  dateLabel,
  weekdayLabel,
}: Props) {
  if (companies.length === 0) return null;

  return (
    <div className="kitchen-assembly-print-root hidden print:block" dir="rtl">
      <style media="print">{`
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        .kitchen-assembly-print-root {
          color: #000000 !important;
          background: #ffffff !important;
          font-family: 'Cairo', 'IBM Plex Sans Arabic', Arial, sans-serif;
          width: 100%;
        }
        .kap-company-page {
          break-after: page;
          page-break-after: always;
          padding-bottom: 4mm;
        }
        .kap-company-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }
        .kap-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border: 2px solid #000000;
          padding: 8px 12px;
          margin-bottom: 10px;
          background: #ffffff;
        }
        .kap-company-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
          color: #000000;
        }
        .kap-subtitle {
          font-size: 11.5px;
          font-weight: 600;
          color: #111827;
          margin-top: 3px;
        }
        .kap-stats {
          display: flex;
          gap: 10px;
          text-align: center;
        }
        .kap-stat-box {
          border: 1.5px solid #000000;
          padding: 4px 10px;
          min-width: 82px;
        }
        .kap-stat-label {
          font-size: 10px;
          font-weight: 700;
          color: #111827;
        }
        .kap-stat-value {
          font-size: 15px;
          font-weight: 800;
          color: #000000;
        }
        .kap-summary-wrap {
          margin-bottom: 12px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .kap-section-heading {
          font-size: 12px;
          font-weight: 800;
          background: #e5e7eb;
          border: 1.5px solid #000000;
          border-bottom: 0;
          padding: 5px 8px;
          color: #000000;
        }
        .kap-summary-table {
          width: 100%;
          border-collapse: collapse;
        }
        .kap-summary-table th,
        .kap-summary-table td {
          border: 1.5px solid #000000;
          padding: 4px 8px;
          font-size: 11px;
          color: #000000;
        }
        .kap-summary-table th {
          background: #f3f4f6;
          font-weight: 800;
        }
        .kap-orders-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .kap-orders-table thead {
          display: table-header-group;
        }
        .kap-orders-table tr {
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .kap-orders-table th,
        .kap-orders-table td {
          border: 1.5px solid #000000;
          padding: 6px 7px;
          font-size: 11px;
          vertical-align: top;
          color: #000000;
        }
        .kap-orders-table th {
          background: #e5e7eb;
          font-weight: 800;
        }
        .kap-col-idx { width: 6%; text-align: center; font-weight: 800; }
        .kap-col-customer { width: 22%; font-weight: 800; word-wrap: break-word; }
        .kap-col-meals { width: 36%; word-wrap: break-word; }
        .kap-col-notes { width: 27%; word-wrap: break-word; }
        .kap-col-qc { width: 9%; text-align: center; vertical-align: middle !important; }
        .kap-meal-line {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 6px;
          padding: 2px 0;
          border-bottom: 1px dotted #6b7280;
        }
        .kap-meal-line:last-child {
          border-bottom: 0;
        }
        .kap-meal-qty {
          font-weight: 800;
          white-space: nowrap;
          border: 1px solid #000000;
          padding: 0 5px;
          font-size: 10.5px;
        }
        .kap-frozen-tag {
          font-size: 9.5px;
          font-weight: 800;
          border: 1px solid #000000;
          padding: 0 4px;
          margin-right: 4px;
        }
        .kap-note-badge {
          border: 1.5px solid #000000;
          background: #f9fafb;
          padding: 3px 6px;
          margin-bottom: 4px;
          font-size: 10.5px;
          font-weight: 700;
          line-height: 1.35;
        }
        .kap-note-badge:last-child {
          margin-bottom: 0;
        }
        .kap-qc-box {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #000000;
          background: #ffffff;
        }
      `}</style>

      {companies.map((company) => (
        <section key={company.key} className="kap-company-page">
          {/* أ) رأس الكشف (Company Header) */}
          <header className="kap-header">
            <div>
              <h1 className="kap-company-title">كشف تجميع ومراجعة الطلبات — {company.companyName}</h1>
              <p className="kap-subtitle">
                تاريخ التنفيذ: {weekdayLabel ? `${weekdayLabel} · ` : ''}
                {dateLabel}
              </p>
            </div>
            <div className="kap-stats">
              <div className="kap-stat-box">
                <div className="kap-stat-label">إجمالي العملاء</div>
                <div className="kap-stat-value">{company.customerCount}</div>
              </div>
              <div className="kap-stat-box">
                <div className="kap-stat-label">إجمالي الوجبات</div>
                <div className="kap-stat-value">{company.totalMealCount}</div>
              </div>
            </div>
          </header>

          {/* ب) جدول ملخص الأصناف للشركة (Company Item Summary) */}
          <div className="kap-summary-wrap">
            <div className="kap-section-heading">
              ملخص إجمالي الأصناف للشركة ({company.itemSummary.length} صنف — إجمالي {company.totalMealCount} علبة/وجبة)
            </div>
            <table className="kap-summary-table">
              <thead>
                <tr>
                  <th style={{ textAlign: 'right', width: '78%' }}>الصنف</th>
                  <th style={{ textAlign: 'center', width: '22%' }}>إجمالي العدد المطلوب</th>
                </tr>
              </thead>
              <tbody>
                {company.itemSummary.map((item) => (
                  <tr key={item.key}>
                    <td style={{ fontWeight: 700 }}>
                      {item.label}
                      {item.isFrozen && <span className="kap-frozen-tag">Frozen / نيء</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 800 }}>{item.totalQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ج) جدول تفاصيل الطلبات والمراجعة (Customer Orders & QC Table) */}
          <div>
            <div className="kap-section-heading">
              تفاصيل طلبات العملاء والمراجعة النهائية (مرتبة أبجدياً)
            </div>
            <table className="kap-orders-table">
              <thead>
                <tr>
                  <th className="kap-col-idx">#</th>
                  <th className="kap-col-customer">اسم العميل</th>
                  <th className="kap-col-meals">الوجبات / الأصناف المطلوبة</th>
                  <th className="kap-col-notes">التعليقات والملاحظات</th>
                  <th className="kap-col-qc">مراجعة (QC)</th>
                </tr>
              </thead>
              <tbody>
                {company.orders.map((order, idx) => (
                  <tr key={order.orderId}>
                    <td className="kap-col-idx">{idx + 1}</td>
                    <td className="kap-col-customer">{order.customerName}</td>
                    <td className="kap-col-meals">
                      {order.mealLines.map((line) => (
                        <div key={line.key} className="kap-meal-line">
                          <span>
                            <strong>{line.label}</strong>
                            {line.isFrozen && <span className="kap-frozen-tag">Frozen</span>}
                          </span>
                          <span className="kap-meal-qty">× {line.quantity}</span>
                        </div>
                      ))}
                    </td>
                    <td className="kap-col-notes">
                      {order.notes.length === 0 ? (
                        <span style={{ color: '#6b7280' }}>—</span>
                      ) : (
                        order.notes.map((note) => (
                          <div key={note.key} className="kap-note-badge">
                            ⚠ {note.mealLabel ? `${note.mealLabel}: ` : ''}
                            {note.text}
                          </div>
                        ))
                      )}
                    </td>
                    <td className="kap-col-qc" aria-label="مربع مراجعة مطبوع">
                      <span className="kap-qc-box" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
