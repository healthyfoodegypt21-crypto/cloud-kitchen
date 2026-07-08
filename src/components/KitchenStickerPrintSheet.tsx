import { KitchenSticker } from '@/lib/kitchen';

interface Props {
  stickers: KitchenSticker[];
}

function formatMacro(value: number | null) {
  return value === null ? '—' : `${value}g`;
}

function formatCalories(value: number | null) {
  return value === null ? '—' : `${value} kcal`;
}

export default function KitchenStickerPrintSheet({ stickers }: Props) {
  return (
    <div className="hidden print:block">
      <style media="print">{`
        @page {
          size: 50mm 100mm;
          margin: 0;
        }

        .kitchen-sticker-page {
          width: 50mm;
          height: 100mm;
          break-after: page;
          page-break-after: always;
        }

        .kitchen-sticker-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        .kitchen-sticker-card {
          width: 50mm;
          height: 100mm;
          break-inside: avoid;
          page-break-inside: avoid;
        }
      `}</style>

      {stickers.map((sticker, index) => (
        <div key={`sticker-page-${sticker.key}-${index + 1}`} className="kitchen-sticker-page">
          <div className="kitchen-sticker-card flex flex-col justify-between border border-dashed border-slate-300 bg-white px-[3mm] py-[3mm] text-slate-900">
            <div className="min-w-0">
              <h2 className="text-[16px] font-bold leading-[1.25] break-words">{sticker.label}</h2>
            </div>

            <div className="grid gap-[2mm] rounded-md border border-slate-200 bg-slate-50 px-[2mm] py-[2mm] text-[12px]">
              <div>
                <p className="text-slate-500">Calories</p>
                <p className="font-semibold">{formatCalories(sticker.calories)}</p>
            </div>
              <div>
                <p className="text-slate-500">Protein</p>
                <p className="font-semibold">{formatMacro(sticker.protein)}</p>
              </div>
              <div>
                <p className="text-slate-500">Carbs</p>
                <p className="font-semibold">{formatMacro(sticker.carbs)}</p>
              </div>
              <div>
                <p className="text-slate-500">Fat</p>
                <p className="font-semibold">{formatMacro(sticker.fat)}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}