
ALTER TABLE public.fund_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.deposits REPLICA IDENTITY FULL;
ALTER TABLE public.profit_distributions REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.islamic_loans REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.fund_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profit_distributions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.islamic_loans;
