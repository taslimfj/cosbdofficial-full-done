import { useState } from 'react';
import { Check, ChevronsUpDown, X, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';

export type MemberOption = { id: string; name: string };

interface Props {
  members: MemberOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** IDs that are auto-excluded and cannot be toggled off (e.g. 3-month overdue). */
  lockedIds?: string[];
  lockedLabel?: string;
  placeholder?: string;
  emptyText?: string;
}

export function MemberMultiSelect({
  members,
  value,
  onChange,
  lockedIds = [],
  lockedLabel = 'Auto excluded',
  placeholder = 'Select members…',
  emptyText = 'No members',
}: Props) {
  const [open, setOpen] = useState(false);
  const lockedSet = new Set(lockedIds);
  const manualSet = new Set(value.filter((id) => !lockedSet.has(id)));

  const lockedMembers = members.filter((m) => lockedSet.has(m.id));
  const manualMembers = members.filter((m) => manualSet.has(m.id));
  const totalExcluded = lockedMembers.length + manualMembers.length;

  const toggle = (id: string) => {
    if (lockedSet.has(id)) return; // cannot toggle locked
    const next = new Set(manualSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="truncate text-left">
              {totalExcluded === 0
                ? <span className="text-muted-foreground">{placeholder}</span>
                : `${totalExcluded} member(s) excluded${lockedMembers.length > 0 ? ` (${lockedMembers.length} auto)` : ''}`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search member…" />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                {members.map((m) => {
                  const isLocked = lockedSet.has(m.id);
                  const isChecked = isLocked || manualSet.has(m.id);
                  return (
                    <CommandItem
                      key={m.id}
                      value={m.name}
                      onSelect={() => toggle(m.id)}
                      className={cn(isLocked && 'opacity-90 cursor-not-allowed')}
                    >
                      <Check className={cn('mr-2 h-4 w-4', isChecked ? 'opacity-100' : 'opacity-0', isLocked && 'text-destructive')} />
                      <span className={cn('flex-1', isLocked && 'text-destructive font-medium')}>{m.name}</span>
                      {isLocked && (
                        <span className="ml-2 flex items-center gap-1 text-[10px] text-destructive">
                          <Lock className="h-3 w-3" /> {lockedLabel}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(lockedMembers.length > 0 || manualMembers.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {lockedMembers.map((m) => (
            <Badge key={m.id} variant="destructive" className="gap-1">
              <Lock className="h-3 w-3" />
              {m.name}
              <span className="text-[10px] opacity-90 ml-0.5">· {lockedLabel}</span>
            </Badge>
          ))}
          {manualMembers.map((m) => (
            <Badge key={m.id} variant="secondary" className="gap-1 pr-1">
              {m.name}
              <button type="button" onClick={() => toggle(m.id)} className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
