import { Input } from '@/components/ui/input';
import { useEffect } from 'react';

interface PhoneInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

/**
 * Phone input that auto-fills the Bangladesh country code (+880) by default.
 * The user can delete or change the prefix freely if they need a different country.
 */
export function PhoneInput({ value, onChange, placeholder = '+8801XXXXXXXXX', className, id }: PhoneInputProps) {
  useEffect(() => {
    if (!value) onChange('+880');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Input
      id={id}
      type="tel"
      inputMode="tel"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

/** Normalises a phone number to digits-only for use as a login identifier. */
export function phoneToDigits(phone: string): string {
  return (phone || '').replace(/[^0-9]/g, '');
}

/** Synthesises an email used as a Supabase auth identifier from a phone number. */
export function phoneToEmail(phone: string): string {
  const digits = phoneToDigits(phone);
  return `${digits}@sharee.local`;
}

/** Default password assigned automatically when a phone-based account is created. */
export const DEFAULT_PHONE_PASSWORD = '123456';
