import { useState } from 'react';
import { Camera, FileSpreadsheet, Filter, Printer, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getTodayDateValue } from '@/lib/utils';
import type { InventoryCategoryRecord, OperationalInventoryItem } from '@/types/operationalInventory';
import WithdrawalSheetPrintSheet from '@/components/inventory/WithdrawalSheetPrintSheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hubName: string;
  items: OperationalInventoryItem[];
  categories: InventoryCategoryRecord[];
  onStartUpload: () => void;
};

export default function WithdrawalSheetDialog({
  open,
  onOpenChange,
  hubName,
  items,
  categories,
  onStartUpload,
}: Props) {
  const [date, setDate] = useState(getTodayDateValue());
  const [shift, setShift] = useState('اليوم بالكامل');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [blankRowsCount, setBlankRowsCount] = useState(6);

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
        date={date}
        shift={shift}
        categoryFilter={categoryFilter}
        blankRowsCount={blankRowsCount}
        isPreview={false}
      />

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6 overflow-hidden" dir="rtl">
          <DialogHeader className="border-b pb-3 text-right">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  <span>ورقة مسحوبات المخزن اليومية</span>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  ورقة مطبوعة منظمة لتدوين مسحوبات المطبخ يدويًا ثم تصويرها ورفعها للخصم التلقائي.
                </DialogDescription>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-300"
                  onClick={() => {
                    onOpenChange(false);
                    onStartUpload();
                  }}
                >
                  <Camera className="ml-1.5 h-4 w-4 text-emerald-600" />
                  <span>رفع الورقة المصورة للخصم</span>
                </Button>
                <Button size="sm" onClick={handlePrint} className="gap-1.5 font-semibold">
                  <Printer className="ml-1.5 h-4 w-4" />
                  <span>طباعة الورقة (A4)</span>
                </Button>
              </div>
            </div>

            {/* Customization Controls */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-2 text-xs bg-muted/40 p-2.5 rounded-lg border">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">التاريخ</Label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-background"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">الوردية</Label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={shift}
                  onChange={(e) => setShift(e.target.value)}
                >
                  <option value="اليوم بالكامل">اليوم بالكامل</option>
                  <option value="الوردية الصباحية">الوردية الصباحية</option>
                  <option value="الوردية المسائية">الوردية المسائية</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">تصفية القسم</Label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">كل الأقسام</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.name_ar}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">أسطر فارغة إضافية</Label>
                <select
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value={blankRowsCount}
                  onChange={(e) => setBlankRowsCount(Number(e.target.value))}
                >
                  <option value={3}>3 أسطر</option>
                  <option value={6}>6 أسطر (موصى به)</option>
                  <option value={10}>10 أسطر</option>
                  <option value={0}>بدون أسطر فارغة</option>
                </select>
              </div>
            </div>
          </DialogHeader>

          {/* Interactive Document Preview */}
          <div className="flex-1 overflow-y-auto p-1 sm:p-2 bg-slate-100/70 rounded-lg border mt-2">
            <WithdrawalSheetPrintSheet
              hubName={hubName}
              items={items}
              categories={categories}
              date={date}
              shift={shift}
              categoryFilter={categoryFilter}
              blankRowsCount={blankRowsCount}
              isPreview={true}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
