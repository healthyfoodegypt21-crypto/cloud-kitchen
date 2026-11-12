import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, formatArabicDate, getArabicWeekday, getTodayDateValue, isValidDateValue } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
};

const WEEKDAY_LABELS = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'long', year: 'numeric' });

function toLocalDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateValue(value: string, days: number) {
  const date = toLocalDate(value);
  date.setDate(date.getDate() + days);
  return toDateValue(date);
}

function buildMonthDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = first.getDay();
  const cells: Array<string | null> = [];
  for (let index = 0; index < leadingBlanks; index += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(toDateValue(new Date(year, month, day)));
  return cells;
}

export function DatePicker({ value, onChange, placeholder = 'اختر التاريخ', disabled, id, className }: Props) {
  const [open, setOpen] = useState(false);
  const today = getTodayDateValue();
  const [viewYear, setViewYear] = useState(() => (isValidDateValue(value) ? toLocalDate(value).getFullYear() : toLocalDate(today).getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (isValidDateValue(value) ? toLocalDate(value).getMonth() : toLocalDate(today).getMonth()));

  const cells = useMemo(() => buildMonthDays(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = MONTH_FORMATTER.format(new Date(viewYear, viewMonth, 1));

  const quickOptions = useMemo(() => ([
    { label: 'اليوم', value: today },
    { label: 'غدًا', value: shiftDateValue(today, 1) },
    { label: 'بعد غد', value: shiftDateValue(today, 2) },
    { label: 'الأسبوع القادم', value: shiftDateValue(today, 7) },
  ]), [today]);

  const selectDate = (dateValue: string) => {
    onChange(dateValue);
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const openCalendar = (nextOpen: boolean) => {
    if (nextOpen) {
      const base = isValidDateValue(value) ? toLocalDate(value) : toLocalDate(today);
      setViewYear(base.getFullYear());
      setViewMonth(base.getMonth());
    }
    setOpen(nextOpen);
  };

  const displayValue = isValidDateValue(value) ? `${getArabicWeekday(value)}، ${formatArabicDate(value)}` : '';

  return (
    <Popover open={open} onOpenChange={openCalendar}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('h-10 w-full justify-start gap-2 rounded-md px-3 text-right font-normal', !displayValue && 'text-muted-foreground', className)}
        >
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{displayValue || placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start" dir="rtl">
        <div className="mb-3 grid grid-cols-2 gap-2">
          {quickOptions.map((option) => (
            <Button
              key={option.label}
              type="button"
              size="sm"
              variant={value === option.value ? 'default' : 'outline'}
              className="rounded-lg"
              onClick={() => selectDate(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="الشهر التالي" onClick={() => shiftMonth(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold">{monthLabel}</span>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="الشهر السابق" onClick={() => shiftMonth(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => <span key={label} className="w-9 py-1">{label}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => cell === null ? (
            <span key={`blank-${index}`} className="h-9 w-9" />
          ) : (
            <Button
              key={cell}
              type="button"
              variant={value === cell ? 'default' : 'ghost'}
              className={cn('h-9 w-9 rounded-md p-0 text-sm font-normal', cell === today && value !== cell && 'border border-primary/40 text-primary')}
              onClick={() => selectDate(cell)}
            >
              {toLocalDate(cell).getDate()}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
