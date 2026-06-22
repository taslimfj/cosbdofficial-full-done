import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Download } from 'lucide-react';
import type { ReportPeriod } from '@/lib/pdfGenerator';

interface Props {
  onDownload: (period: ReportPeriod) => void | Promise<void>;
  label?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'sm' | 'default' | 'lg';
}

export function PdfPeriodButton({ onDownload, label = 'PDF Report', variant = 'outline', size = 'sm' }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className="gap-2">
          <Download className="w-4 h-4" /> {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Download as PDF</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDownload('3m')}>Last 3 Months</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload('6m')}>Last 6 Months</DropdownMenuItem>
        <DropdownMenuItem onClick={() => onDownload('1y')}>Last 1 Year</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
