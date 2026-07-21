import { cn } from '@/lib/utils';

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

export default function BrandLogo({ compact = false, className, iconClassName, textClassName }: BrandLogoProps) {
  return (
    <div className={cn('flex items-center gap-3 text-foreground', className)} aria-label="Cloud Kitchens">
      <svg
        viewBox="0 0 132 74"
        role="img"
        aria-label="Cloud Kitchens"
        className={cn('h-11 w-20 shrink-0', iconClassName)}
      >
        <path
          d="M24 63h76c12.7 0 23-10.3 23-23 0-12-9.3-21.9-21.1-22.9C98.6 7.1 89.4 1 79 1 65.3 1 53.9 10.4 51 23c-2.8-1.9-6.2-3-9.9-3C31.6 20 23.8 27.3 22.4 36.6 12.9 38.2 5 46.5 5 56.6c0 2.3.3 4.5 1 6.4h18Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <div className={cn('flex flex-col leading-[0.92]', textClassName)}>
          <span className="text-[1.05rem] font-black tracking-[0.08em] uppercase">Cloud</span>
          <span className="text-[1.05rem] font-black tracking-[0.06em] uppercase">Kitchens<sup className="ml-0.5 text-[0.4rem] align-top">™</sup></span>
        </div>
      )}
    </div>
  );
}