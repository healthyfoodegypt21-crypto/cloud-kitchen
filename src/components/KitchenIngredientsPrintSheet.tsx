import {
  BrandIngredientsSummary,
  formatKitchenWeight,
  INGREDIENT_STATION_LABELS,
  INGREDIENT_STATION_ORDER,
  KitchenIngredientsReport,
} from '@/lib/kitchenIngredients';

interface Props {
  report: KitchenIngredientsReport;
  activeScope: string;
  dateLabel: string;
}

export default function KitchenIngredientsPrintSheet({
  report,
  activeScope,
  dateLabel,
}: Props) {
  const summary: BrandIngredientsSummary =
    activeScope === 'all'
      ? report.combined
      : report.byBrand[activeScope] ?? report.combined;

  const isCombined = activeScope === 'all' && report.brands.length > 1;
  const totalBefore = formatKitchenWeight(summary.totalWeightBeforeGrams);
  const totalAfter = formatKitchenWeight(summary.totalWeightAfterGrams);

  const groupedStations = INGREDIENT_STATION_ORDER.map((station) => ({
    station,
    label: INGREDIENT_STATION_LABELS[station],
    items: summary.items.filter((item) => item.station === station && item.portionCount > 0),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="kitchen-ingredients-print-sheet hidden print:block" dir="rtl">
      <style media="print">{`
        @page { size: A4 portrait; margin: 10mm; }
        .kitchen-ingredients-print-sheet { color: #0f172a; font-family: Arial, sans-serif; }
        .kip-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
        .kip-title { font-size: 19px; font-weight: 700; margin: 0; }
        .kip-meta { font-size: 11px; color: #475569; margin-top: 4px; }
        .kip-kpis { display: flex; gap: 12px; font-size: 11px; font-weight: 700; }
        .kip-kpi-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 5px 9px; border-radius: 4px; text-align: center; }
        .kip-section { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }
        .kip-section-title { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 8px; font-size: 12px; font-weight: 700; }
        .kip-table { width: 100%; border-collapse: collapse; }
        .kip-table th, .kip-table td { border: 1px solid #cbd5e1; padding: 5px 7px; font-size: 10.5px; vertical-align: middle; }
        .kip-table th { background: #f8fafc; font-weight: 700; }
        .kip-num { text-align: center; font-weight: 700; white-space: nowrap; }
        .kip-sub { display: block; font-size: 9.5px; font-weight: 400; color: #64748b; }
        .kip-adj-box { border: 1px dashed #94a3b8; background: #f8fafc; padding: 8px 10px; margin-top: 10px; break-inside: avoid; }
        .kip-adj-title { font-size: 11.5px; font-weight: 700; margin-bottom: 5px; }
        .kip-adj-item { font-size: 10px; padding: 2px 0; border-bottom: 1px dotted #cbd5e1; display: flex; justify-content: space-between; gap: 8px; }
        .kip-adj-item:last-child { border-bottom: 0; }
      `}</style>

      <div className="kip-header">
        <div>
          <h1 className="kip-title">كشف حساب وتجهيز مكونات المطبخ</h1>
          <p className="kip-meta">
            النطاق: {summary.brandName} · التاريخ: {dateLabel} · الوجبات المستوية المحسوبة: {summary.cookedMealCount}
          </p>
        </div>
        <div className="kip-kpis">
          <div className="kip-kpi-box">
            <div>إجمالي قبل التسوية</div>
            <div>{totalBefore.primary}</div>
          </div>
          <div className="kip-kpi-box">
            <div>إجمالي بعد التسوية</div>
            <div>{totalAfter.primary}</div>
          </div>
        </div>
      </div>

      {groupedStations.map((group) => (
        <section key={group.station} className="kip-section">
          <div className="kip-section-title">
            {group.label} ({group.items.length} صنف)
          </div>
          <table className="kip-table">
            <thead>
              <tr>
                <th>المكون / الخامة</th>
                <th className="kip-num">الأوردرات / الحصص</th>
                {isCombined &&
                  report.brands.map((brand) => (
                    <th key={brand.id} className="kip-num">
                      {brand.name}
                    </th>
                  ))}
                <th className="kip-num">الوزن قبل التسوية (خام)</th>
                <th className="kip-num">الوزن بعد التسوية (صافي)</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => {
                const beforeFmt = formatKitchenWeight(item.weightBeforeGrams);
                const afterFmt = formatKitchenWeight(item.weightAfterGrams);
                return (
                  <tr key={item.key}>
                    <td>
                      <strong>{item.name}</strong>
                      {(item.removedPortionCount > 0 || item.addedBySubstitutionCount > 0 || item.extraPortionCount > 0) && (
                        <span className="kip-sub">
                          أساسي: {item.basePortionCount}
                          {item.removedPortionCount > 0 ? ` | استبعاد: -${item.removedPortionCount}` : ''}
                          {item.addedBySubstitutionCount > 0 ? ` | استبدال: +${item.addedBySubstitutionCount}` : ''}
                          {item.extraPortionCount > 0 ? ` | إضافي: +${item.extraPortionCount}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="kip-num">{item.portionCount}</td>
                    {isCombined &&
                      report.brands.map((brand) => {
                        const split = item.byBrand[brand.id];
                        return (
                          <td key={brand.id} className="kip-num">
                            {split ? split.portionCount : 0}
                            {split && split.portionCount > 0 && (
                              <span className="kip-sub">
                                {formatKitchenWeight(split.weightBeforeGrams).primary} ← {formatKitchenWeight(split.weightAfterGrams).primary}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    <td className="kip-num">
                      {beforeFmt.primary}
                      {beforeFmt.secondary && <span className="kip-sub">{beforeFmt.secondary}</span>}
                    </td>
                    <td className="kip-num">
                      {afterFmt.primary}
                      {afterFmt.secondary && <span className="kip-sub">{afterFmt.secondary}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      {summary.adjustments.length > 0 && (
        <div className="kip-adj-box">
          <div className="kip-adj-title">
            سجل التعديلات الذكية المطبقة تلقائياً من ملاحظات العملاء ({summary.adjustments.length})
          </div>
          {summary.adjustments.map((adj) => (
            <div key={adj.id} className="kip-adj-item">
              <span>
                <strong>{adj.brandName}</strong> · {adj.customerName}: {adj.summary}
              </span>
              <span>«{adj.rawInstruction}»</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
