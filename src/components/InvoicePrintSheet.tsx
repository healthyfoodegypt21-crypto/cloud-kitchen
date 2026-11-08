import { Brand } from '@/hooks/useBrands';
import { buildOrderLocationUrl, formatArabicDate, formatEGPCurrency, getArabicWeekday } from '@/lib/utils';
import { Order, ORDER_MODE_LABELS } from '@/types/order';
import { QRCodeSVG } from 'qrcode.react';

interface Props {
  orders: Order[];
  brands: Brand[];
}

function chunkOrders(orders: Order[]) {
  const pages: Order[][] = [];
  for (let index = 0; index < orders.length; index += 1) {
    pages.push(orders.slice(index, index + 2));
    index += 1;
  }
  return pages;
}

function InvoiceField({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={`grid grid-cols-[62px_1fr] gap-2 ${className}`}>
      <p className="text-[10px] font-bold text-slate-700">{label}</p>
      <p className="text-[12px] font-bold leading-5 text-slate-950 whitespace-pre-wrap break-words">{value || '-'}</p>
    </div>
  );
}

export default function InvoicePrintSheet({ orders, brands }: Props) {
  const brandNameById = new Map(brands.map(brand => [brand.id, brand.name]));
  const pages = chunkOrders(orders);

  return (
    <div className="invoice-print-sheet hidden print:block">
      <style media="print">{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        .invoice-print-page {
          break-after: page;
          page-break-after: always;
          width: 100%;
          height: 280mm;
          padding: 7mm;
          box-sizing: border-box;
          display: grid;
          grid-template-rows: repeat(2, minmax(0, 1fr));
          gap: 5mm;
        }

        .invoice-print-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }

        .invoice-print-card {
          break-inside: avoid;
          page-break-inside: avoid;
          height: auto;
          min-height: 0;
          overflow: hidden;
        }

        .invoice-print-card .invoice-details,
        .invoice-print-card .invoice-notes,
        .invoice-print-card .invoice-address {
          min-height: 0;
          overflow: hidden;
        }

        @media print {
          body > #root {
            visibility: hidden;
          }

          body > #root .invoice-print-sheet {
            visibility: visible;
            position: absolute;
            inset: 0;
            width: 100%;
          }
        }
      `}</style>

      {pages.map((pageOrders, pageIndex) => (
        <div
          key={`invoice-page-${pageIndex + 1}`}
          className="invoice-print-page"
          style={{ gridTemplateRows: 'repeat(2, minmax(0, 1fr))' }}
        >
          {pageOrders.map((order) => {
            const brandName = order.brand_id ? (brandNameById.get(order.brand_id) ?? 'بدون شركة') : 'بدون شركة';
            const executionDay = getArabicWeekday(order.execution_date);
            const executionDate = formatArabicDate(order.execution_date);
            const deliveryDate = executionDay ? `${executionDay} - ${executionDate}` : executionDate;
            const customerAmount = order.customer_amount ?? order.price;
            const deliveryFee = order.delivery_fee ?? 0;
            const totalDue = customerAmount + deliveryFee;
            const details = order.imported_meal_details?.length
              ? order.imported_meal_details.join('\n')
              : order.package || 'لا توجد تفاصيل';
            const notes = removeRepeatedDetails(order.notes, details) || 'لا توجد ملاحظات إضافية';
            const locationUrl = order.location_link ? buildOrderLocationUrl(order) : '';

            return (
              <div
                key={order.id}
                className="invoice-print-card flex flex-col rounded-[10px] border-2 border-slate-900 bg-white text-slate-950"
              >
                <div className="flex items-center justify-between border-b-2 border-slate-900 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-lg border-2 border-slate-900 text-[11px] font-black leading-3">
                      ED<br />LX
                    </div>
                    <div>
                      <h2 className="text-xl font-black">بوليصة شحن وتوصيل</h2>
                      <p className="text-[11px] font-bold text-slate-600">Delivery Waybill</p>
                    </div>
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-bold text-slate-600">Express Delivery / Logix Services</p>
                    <p className="text-[9px] font-semibold text-slate-600">جهة الشحن والتوصيل</p>
                    <p className="mt-1 text-[10px] font-bold text-slate-600">رقم الشحنة</p>
                    <p className="text-sm font-black">{order.order_number}</p>
                  </div>
                </div>

                <div className="grid min-h-0 grid-cols-[1.02fr_0.98fr] gap-3 p-4">
                  <div className="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_minmax(0,1fr)] gap-2">
                    <div className="rounded-lg border border-slate-400 bg-slate-100 px-3 py-2">
                      <InvoiceField label="الشركة" value={brandName} />
                    </div>

                    <div className="rounded-lg border border-slate-400 px-3 py-2">
                      <div className="grid gap-1.5">
                        <InvoiceField label="اسم العميل" value={order.customer_name} />
                        <InvoiceField label="الهاتف" value={order.phone} />
                        <InvoiceField label="رقم بديل" value={order.phone_secondary || 'لا يوجد'} />
                      </div>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_92px] gap-3 rounded-lg border border-slate-400 px-3 py-2">
                      <InvoiceField label="العنوان" value={order.address} className="invoice-address h-full content-start" />
                      {locationUrl && <div className="flex min-h-[30mm] flex-col items-center justify-start gap-1 rounded-md border-2 border-slate-700 bg-white px-1.5 py-1.5">
                        <QRCodeSVG value={locationUrl} size={78} level="H" includeMargin />
                        <p className="text-center text-[9px] font-bold leading-3 text-slate-700">امسح لفتح العنوان</p>
                      </div>}
                    </div>

                    <div className="min-h-0 overflow-hidden rounded-lg border border-slate-400 bg-slate-100 px-3 py-2">
                        <InvoiceField label="الملاحظات" value={notes} className="invoice-notes h-full content-start" />
                    </div>
                  </div>

                  <div className="grid min-h-0 gap-3">
                    <div className="rounded-lg border border-slate-400 px-3 py-2">
                      <div className="grid gap-1.5">
                        <InvoiceField label="نوع الطلب" value={ORDER_MODE_LABELS[order.order_mode]} />
                        <InvoiceField label="حساب العميل" value={formatEGPCurrency(customerAmount)} />
                        <InvoiceField label="التوصيل" value={formatEGPCurrency(deliveryFee)} />
                        <InvoiceField label="الإجمالي" value={formatEGPCurrency(totalDue)} />
                        <InvoiceField label="التسليم" value={deliveryDate} />
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-400 px-3 py-2">
                      <div>
                        <InvoiceField label="التفاصيل" value={details} className="invoice-details" />
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function removeRepeatedDetails(notes: string, details: string) {
  if (!notes || !details) return notes;
  const detailLines = details.split('\n').map(line => line.trim()).filter(Boolean);
  return notes.split('\n').filter(line => !detailLines.some(detail => line.trim() === detail)).join('\n').trim();
}