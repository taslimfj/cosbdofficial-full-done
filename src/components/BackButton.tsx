import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide on root dashboard
  if (location.pathname === '/') return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 gap-1 text-muted-foreground hover:text-foreground"
      onClick={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/');
      }}
      aria-label="Back"
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="text-sm">Back</span>
    </Button>
  );
}
