import * as React from 'react';
import { format, isValid, parse } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  /** ISO date string yyyy-MM-dd */
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * DateField — manually type as DD/MM/YYYY or pick from calendar.
 * Stores value as ISO yyyy-MM-dd.
 */
export function DateField({ value, onChange, placeholder = 'DD/MM/YYYY', disabled, className, id }: Props) {
  const [text, setText] = React.useState<string>(() => isoToDisplay(value));
  const [open, setOpen] = React.useState(false);

  // Sync when external value changes
  React.useEffect(() => {
    setText(isoToDisplay(value));
  }, [value]);

  const commit = (raw: string) => {
    const iso = displayToIso(raw);
    if (iso !== null) onChange(iso);
    else if (raw.trim() === '') onChange('');
  };

  const selected = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;

  return (
    <div className={cn('relative flex items-center', className)}>
      <Input
        id={id}
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const masked = maskInput(e.target.value);
          setText(masked);
          if (masked.length === 10) commit(masked);
        }}
        onBlur={() => commit(text)}
        className="pr-10"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-1 h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Open calendar"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            selected={selected && isValid(selected) ? selected : undefined}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, 'yyyy-MM-dd'));
                setOpen(false);
              }
            }}
            initialFocus
            className={cn('p-3 pointer-events-auto')}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function maskInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yy = digits.slice(4, 8);
  let out = dd;
  if (digits.length >= 3) out += '/' + mm;
  if (digits.length >= 5) out += '/' + yy;
  return out;
}

function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const d = parse(iso, 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'dd/MM/yyyy') : '';
}

function displayToIso(display: string): string | null {
  if (!display || display.length < 10) return null;
  const d = parse(display, 'dd/MM/yyyy', new Date());
  if (!isValid(d)) return null;
  return format(d, 'yyyy-MM-dd');
}
