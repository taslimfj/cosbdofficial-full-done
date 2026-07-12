import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
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
  placeholder?: string;
  emptyText?: string;
}

export function MemberMultiSelect({ members, value, onChange, placeholder = 'Select members…', emptyText = 'No members' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const selectedMembers = members.filter(m => selected.has(m.id));

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
            <span className="truncate text-left">
              {selectedMembers.length === 0 ? <span className="text-muted-foreground">{placeholder}</span> : `${selectedMembers.length} member(s) excluded`}
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
                {members.map((m) => (
                  <CommandItem key={m.id} value={m.name} onSelect={() => toggle(m.id)}>
                    <Check className={cn('mr-2 h-4 w-4', selected.has(m.id) ? 'opacity-100' : 'opacity-0')} />
                    {m.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {selectedMembers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedMembers.map(m => (
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
