GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.record_islamic_loan_payment(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_islamic_loan_payment(uuid, numeric, text) TO authenticated;