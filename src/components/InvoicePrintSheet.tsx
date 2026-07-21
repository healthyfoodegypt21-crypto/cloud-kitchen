import { Brand } from '@/hooks/useBrands';
import { buildOrderLocationUrl, formatArabicDate, formatEGPCurrency, getArabicWeekday } from '@/lib/utils';
import { Order, ORDER_MODE_LABELS } from '@/types/order';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  orders: Order[];
  brands: Brand[];
}

const SHIPPING_COMPANY_NAME = 'Cloud Kitchens';
const SHIPPING_COMPANY_TAGLINE = 'وثيقة تسليم معتمدة';

function InvoiceField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`grid grid-cols-[62px_1fr] gap-2 ${className}`}>
      <p className="text-[8px] font-medium text-slate-500">{label}</p>
      <p className="text-[10px] font-semibold leading-4 text-slate-900 whitespace-pre-wrap break-words">{value || '-'}</p>
    </div>
  );
}

function chunkOrders(orders: Order[], size: number) {
  const pages: Order[][] = [];

  for (let index = 0; index < orders.length; index += size) {
    pages.push(orders.slice(index, index + size));
  }

  return pages;
}

export default function InvoicePrintSheet({ orders, brands }: Props) {
  const brandNameById = new Map(brands.map(brand => [brand.id, brand.name]));
  const pages = chunkOrders(orders, 3);

  return (
    <div className="hidden print:block">
      <style media="print">{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        .invoice-print-page {
          break-after: page;
          page-break-after: always;
          width: 100%;
          height: 268mm;
          display: grid;
          grid-template-rows: repeat(3, 87.5mm);
          gap: 2.25mm;
          align-content: stretch;
        }

        .invoice-print-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        .invoice-print-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      `}</style>

      {pages.map((pageOrders, pageIndex) => (
        <div
          key={`invoice-page-${pageIndex + 1}`}
          className="invoice-print-page"
        >
          {pageOrders.map((order) => {
            const brandName = order.brand_id ? (brandNameById.get(order.brand_id) ?? 'بدون شركة') : 'بدون شركة';
            const executionDay = getArabicWeekday(order.execution_date);
            const executionDate = formatArabicDate(order.execution_date);
            const deliveryDate = executionDay ? `${executionDay} - ${executionDate}` : executionDate;
            const notes = order.notes || 'لا توجد ملاحظات إضافية';
            const locationUrl = buildOrderLocationUrl(order);

            return (
              <div
                key={order.id}
                className="invoice-print-card flex h-full flex-col overflow-hidden rounded-[14px] border border-slate-300 bg-white"
              >
                <div className="border-b bg-[linear-gradient(135deg,#0f172a,#1e293b_55%,#334155)] px-3.5 py-2 text-white">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10">
                        <svg viewBox="0 0 150 72" className="h-6 w-7" fill="none" aria-label="Cloud Kitchens">
                          <path d="M22 57.5h75.5c12.4 0 22.5-9.8 22.5-21.9 0-11.4-8.9-20.8-20.3-21.8C95.4 5.4 86.7.5 76.5.5 63.1.5 51.6 9 47.4 21.1c-9 .1-16.4 6.8-17.6 15.5C20 37.2 12 45.3 12 55.1c0 1.3.1 2.6.4 3.9h9.6Z" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-[0.24em] text-slate-200">{SHIPPING_COMPANY_NAME}</p>
                        <h2 className="text-[13px] font-bold leading-4">بوليصة شحن</h2>
                        <p className="text-[8px] text-slate-300">{SHIPPING_COMPANY_TAGLINE}</p>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-left">
                      <p className="text-[8px] text-slate-200">رقم الشحنة</p>
                      <p className="text-[10px] font-semibold tracking-[0.06em]">{order.order_number}</p>
                    </div>
                  </div>
                </div>

                <div className="grid flex-1 grid-cols-[1.02fr_0.98fr] gap-2 p-2.5">
                  <div className="grid grid-rows-[auto_auto_1fr] gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <InvoiceField label="الشركة" value={brandName} />
                    </div>

                    <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                      <div className="grid gap-1.5">
                        <InvoiceField label="اسم العميل" value={order.customer_name} />
                        <InvoiceField label="الهاتف" value={order.phone} />
                        <InvoiceField label="رقم بديل" value={order.phone_secondary || 'لا يوجد'} />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                      <InvoiceField label="العنوان" value={order.address} className="h-full content-start" />
                    </div>
                  </div>

                  <div className="grid grid-rows-[auto_auto_1fr_auto] gap-2">
                    <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                      <div className="grid gap-1.5">
                        <InvoiceField label="نوع الطلب" value={ORDER_MODE_LABELS[order.order_mode]} />
                        <InvoiceField label="الحساب" value={formatEGPCurrency(order.price)} />
                        <InvoiceField label="التسليم" value={deliveryDate} />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 px-2 py-1.5">
                      <InvoiceField label="التفاصيل" value={order.package} />
                    </div>

                    <div className="grid grid-cols-[1fr_66px] gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                      <InvoiceField label="الملاحظات" value={notes} className="h-full content-start" />
                      <div className="flex flex-col items-center justify-start gap-1 rounded-md border border-dashed border-slate-300 bg-white px-1 py-1">
                        <QRCodeSVG value={locationUrl} size={52} level="M" includeMargin={false} />
                        <p className="text-center text-[7px] font-medium leading-3 text-slate-500">امسح لفتح الموقع</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[8px] text-slate-500">
                      <span>{SHIPPING_COMPANY_NAME}</span>
                      <span>قص من الإطار</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {pageOrders.length < 3 && Array.from({ length: 3 - pageOrders.length }).map((_, fillerIndex) => (
            <div key={`filler-${pageIndex + 1}-${fillerIndex + 1}`} className="invoice-print-card h-full rounded-[14px] border border-transparent" />
          ))}
        </div>
      ))}
    </div>
  );
}