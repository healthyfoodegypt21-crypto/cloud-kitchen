import {
  KitchenDailySummary,
  KITCHEN_CATEGORY_LABELS,
  KITCHEN_COOKED_CATEGORY_ORDER,
} from '@/lib/kitchen';

interface Props {
  summary: KitchenDailySummary;
  dateLabel: string;
  brandLabel: string;
}

export default function KitchenReportPrintSheet({ summary, dateLabel, brandLabel }: Props) {
  const cookedSections = summary.brands.flatMap(brand => KITCHEN_COOKED_CATEGORY_ORDER.map(category => ({
    key: `${brand.key}-${category}`,
    brandName: brand.brandName,
    category,
    meals: brand.meals.filter(meal => meal.category === category),
  })).filter(section => section.meals.length > 0));

  const frozenSections = summary.brands
    .map(brand => ({
      key: `${brand.key}-frozen`,
      brandName: brand.brandName,
      meals: brand.meals.filter(meal => meal.category === 'frozen'),
    }))
    .filter(section => section.meals.length > 0);

  return (
    <div className="kitchen-report-print-sheet hidden print:block" dir="rtl">
      <style media="print">{`
        @page { size: A4 portrait; margin: 12mm; }
        .kitchen-report-print-sheet { color: #111827; font-family: Arial, sans-serif; }
        .kitchen-report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 12px; }
        .kitchen-report-title { font-size: 20px; font-weight: 700; margin: 0; }
        .kitchen-report-meta { font-size: 11px; color: #4b5563; margin-top: 4px; }
        .kitchen-report-total { font-size: 14px; font-weight: 700; white-space: nowrap; }
        .kitchen-report-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }
        .kitchen-report-section-title { background: #f3f4f6; border: 1px solid #d1d5db; padding: 6px 8px; font-size: 13px; font-weight: 700; }
        .kitchen-report-frozen-divider { border-top: 2px dashed #0284c7; margin: 18px 0 12px; padding-top: 10px; }
        .kitchen-report-frozen-banner { background: #e0f2fe; border: 1px solid #7dd3fc; padding: 8px 10px; margin-bottom: 10px; font-size: 13px; font-weight: 700; color: #0c4a6e; }
        .kitchen-report-frozen-title { background: #f0f9ff; border: 1px solid #7dd3fc; padding: 6px 8px; font-size: 13px; font-weight: 700; color: #0c4a6e; }
        .kitchen-report-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .kitchen-report-table th, .kitchen-report-table td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: top; font-size: 11px; }
        .kitchen-report-table th { background: #fafafa; font-weight: 700; }
        .kitchen-report-meal { width: 48%; }
        .kitchen-report-count { width: 14%; text-align: center; font-weight: 700; }
        .kitchen-report-notes { width: 38%; }
        .kitchen-report-note { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px dotted #9ca3af; padding: 2px 0; }
        .kitchen-report-note:last-child { border-bottom: 0; }
        .kitchen-report-note-count { font-weight: 700; white-space: nowrap; }
        .kitchen-report-empty { color: #6b7280; }
      `}</style>

      <div className="kitchen-report-header">
        <div>
          <h1 className="kitchen-report-title">أمر المطبخ اليومي</h1>
          <p className="kitchen-report-meta">{brandLabel} - {dateLabel}</p>
        </div>
        <div className="kitchen-report-total">إجمالي الوجبات: {summary.totalMealCount}</div>
      </div>

      {cookedSections.map(section => (
        <section key={section.key} className="kitchen-report-section">
          <div className="kitchen-report-section-title">
            {section.brandName} - {KITCHEN_CATEGORY_LABELS[section.category]}
          </div>
          <table className="kitchen-report-table">
            <thead>
              <tr>
                <th className="kitchen-report-meal">اسم الوجبة</th>
                <th className="kitchen-report-count">الإجمالي</th>
                <th className="kitchen-report-notes">ملاحظات الوجبات</th>
              </tr>
            </thead>
            <tbody>
              {section.meals.map(meal => (
                <tr key={meal.key}>
                  <td className="kitchen-report-meal">{meal.label}</td>
                  <td className="kitchen-report-count">{meal.count}</td>
                  <td className="kitchen-report-notes">
                    {meal.modifications.length === 0 ? (
                      <span className="kitchen-report-empty">—</span>
                    ) : (
                      meal.modifications.map(modification => (
                        <div key={modification.key} className="kitchen-report-note">
                          <span>{modification.instruction}</span>
                          <span className="kitchen-report-note-count">{modification.count}</span>
                        </div>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {frozenSections.length > 0 && (
        <div className="kitchen-report-frozen-divider">
          <div className="kitchen-report-frozen-banner">
            قسم مستقل: {KITCHEN_CATEGORY_LABELS.frozen} (وجبات فروزن / جاهزة للتسوية — منفصلة عن الوجبات المستوية)
          </div>
          {frozenSections.map(section => (
            <section key={section.key} className="kitchen-report-section">
              <div className="kitchen-report-frozen-title">
                {section.brandName} - {KITCHEN_CATEGORY_LABELS.frozen}
              </div>
              <table className="kitchen-report-table">
                <thead>
                  <tr>
                    <th className="kitchen-report-meal">اسم الوجبة</th>
                    <th className="kitchen-report-count">الإجمالي</th>
                    <th className="kitchen-report-notes">ملاحظات الوجبات</th>
                  </tr>
                </thead>
                <tbody>
                  {section.meals.map(meal => (
                    <tr key={meal.key}>
                      <td className="kitchen-report-meal">{meal.label}</td>
                      <td className="kitchen-report-count">{meal.count}</td>
                      <td className="kitchen-report-notes">
                        {meal.modifications.length === 0 ? (
                          <span className="kitchen-report-empty">—</span>
                        ) : (
                          meal.modifications.map(modification => (
                            <div key={modification.key} className="kitchen-report-note">
                              <span>{modification.instruction}</span>
                              <span className="kitchen-report-note-count">{modification.count}</span>
                            </div>
                          ))
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
