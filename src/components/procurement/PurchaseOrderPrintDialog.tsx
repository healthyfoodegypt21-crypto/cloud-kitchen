import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PurchaseOrderPrintSheet, { type PurchaseShortageItem } from '@/components/procurement/PurchaseOrderPrintSheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hubName?: string;
  purchaserName?: string;
  shortages: PurchaseShortageItem[];
};

export default function PurchaseOrderPrintDialog({
  open,
  onOpenChange,
  hubName,
  purchaserName,
  shortages,
}: Props) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Hidden printable sheet that renders during window.print() */}
      <PurchaseOrderPrintSheet
        hubName={hubName}
        purchaserName={purchaserName}
        shortages={shortages}
        isPreview={false}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-white text-[#111827]" dir="rtl">
          <DialogHeader className="border-b border-gray-200 pb-3 text-right">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">
                  طباعة طلب مشتريات
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-1">
                  ورقة مطبوعة بنواقص المخزن وخانات فارغة لكتابة أي أصناف مطلوبة وسعرها بخط اليد.
                </DialogDescription>
              </div>

              <Button onClick={handlePrint} className="gap-2 font-semibold">
                <Printer className="h-4 w-4" />
                <span>طباعة الطلب</span>
              </Button>
            </div>
          </DialogHeader>

          {/* Interactive Document Preview */}
          <div className="flex-1 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200 mt-2">
            <PurchaseOrderPrintSheet
              hubName={hubName}
              purchaserName={purchaserName}
              shortages={shortages}
              isPreview={true}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
