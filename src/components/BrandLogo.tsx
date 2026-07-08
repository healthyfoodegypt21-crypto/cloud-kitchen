import { Cloud } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export default function BrandLogo({ compact = false, className, iconClassName, textClassName }: BrandLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15', iconClassName)}>
        <Cloud className="h-6 w-6" />
      </div>
      {!compact && (
        <div className={cn('flex flex-col leading-none', textClassName)}>
          <span className="text-base font-black tracking-[0.18em] text-foreground uppercase">Cloud</span>
          <span className="text-sm font-semibold tracking-[0.24em] text-primary uppercase">Kitchen</span>
        </div>
      )}
    </div>
  );
}