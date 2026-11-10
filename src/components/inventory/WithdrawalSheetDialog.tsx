import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';
import WithdrawalSheetPrintSheet from '@/components/inventory/WithdrawalSheetPrintSheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hubName: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
};

export default function WithdrawalSheetDialog({
  open,
  onOpenChange,
  hubName,
  items,
  categories,
}: Props) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      {/* Hidden printable sheet that triggers during window.print() */}
      <WithdrawalSheetPrintSheet
        hubName={hubName}
        items={items}
        categories={categories}
        isPreview={false}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-white text-[#111827]" dir="rtl">
          <DialogHeader className="border-b border-gray-200 pb-3 text-right">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-xl font-bold text-gray-900">
                  ورقة مسحوبات
                </DialogTitle>
                <DialogDescription className="text-xs text-gray-500 mt-1">
                  معاينة ورقة مسحوبات المخزن الجاهزة للطباعة والكتابة اليدوية.
                </DialogDescription>
              </div>

              <Button onClick={handlePrint} className="gap-2 font-semibold">
                <Printer className="h-4 w-4" />
                <span>طباعة الورقة</span>
              </Button>
            </div>
          </DialogHeader>

          {/* Interactive Document Preview (Old Clean White Design) */}
          <div className="flex-1 overflow-y-auto p-2 bg-gray-50 rounded-lg border border-gray-200 mt-2">
            <WithdrawalSheetPrintSheet
              hubName={hubName}
              items={items}
              categories={categories}
              isPreview={true}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
