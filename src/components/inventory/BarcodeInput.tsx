import { useState } from 'react';
import { ScanBarcode, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  onScan: (code: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

const MIN_CODE_LENGTH = 3;

export default function BarcodeInput({ onScan, placeholder, autoFocus }: Props) {
  const [value, setValue] = useState('');

  const submit = () => {
    const code = value.trim();
    if (code.length < MIN_CODE_LENGTH) return;
    onScan(code);
    setValue('');
  };

  return (
    <div dir="rtl" className="space-y-1">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <ScanBarcode className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={placeholder ?? 'امسح الباركود أو اكتب الكود ثم Enter'}
            autoFocus={autoFocus}
            className="pr-9"
            inputMode="search"
          />
        </div>
        <Button type="button" variant="secondary" onClick={submit} disabled={value.trim().length < MIN_CODE_LENGTH}>
          <Search className="ml-1 h-4 w-4" /> بحث
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">امسح الباركود أو اكتب الكود ثم Enter</p>
    </div>
  );
}
