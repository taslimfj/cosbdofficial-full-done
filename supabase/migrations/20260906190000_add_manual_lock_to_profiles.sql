-- Add is_manual_locked column to profiles table so admin can manually lock/unlock member accounts
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_manual_locked boolean DEFAULT false;
