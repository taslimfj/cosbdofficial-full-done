CREATE OR REPLACE FUNCTION private.recalculate_member_total_deposited(_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _deposit_total numeric := 0;
  _distribution_total numeric := 0;
BEGIN
  IF _member_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
    INTO _deposit_total
  FROM public.deposits
  WHERE member_id = _member_id
    AND status = 'approved';

  SELECT COALESCE(SUM(amount), 0)
    INTO _distribution_total
  FROM public.profit_distributions
  WHERE member_id = _member_id;

  UPDATE public.profiles
    SET total_deposited = GREATEST(0, _deposit_total + _distribution_total),
        updated_at = now()
  WHERE id = _member_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_member_total_from_deposits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM private.recalculate_member_total_deposited(NEW.member_id);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM private.recalculate_member_total_deposited(OLD.member_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_total_deposits ON public.deposits;
CREATE TRIGGER trg_sync_member_total_deposits
AFTER INSERT OR UPDATE OR DELETE ON public.deposits
FOR EACH ROW EXECUTE FUNCTION private.sync_member_total_from_deposits();

CREATE OR REPLACE FUNCTION private.sync_member_total_from_distributions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM private.recalculate_member_total_deposited(NEW.member_id);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM private.recalculate_member_total_deposited(OLD.member_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_member_total_distributions ON public.profit_distributions;
CREATE TRIGGER trg_sync_member_total_distributions
AFTER INSERT OR UPDATE OR DELETE ON public.profit_distributions
FOR EACH ROW EXECUTE FUNCTION private.sync_member_total_from_distributions();