
-- 1) Restrict get_member_deposit_months to caller's own rows (or admins)
CREATE OR REPLACE FUNCTION public.get_member_deposit_months()
RETURNS TABLE(member_id uuid, month_year date, created_at timestamp with time zone, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT d.member_id, d.month_year, d.created_at, d.status
  FROM public.deposits d
  WHERE d.status = 'approved'
    AND (d.member_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
$function$;

-- 2) Admin-only guard on ensure_current_welfare_cycle
CREATE OR REPLACE FUNCTION public.ensure_current_welfare_cycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Dhaka')::date;
  yr int := extract(year from today);
  candidates date[];
  c date;
  chosen date := NULL;
  new_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  candidates := ARRAY[
    make_date(yr,3,30),
    make_date(yr,6,30),
    make_date(yr,9,30),
    make_date(yr,12,30)
  ];
  FOREACH c IN ARRAY candidates LOOP
    IF c <= today AND (chosen IS NULL OR c > chosen) THEN
      chosen := c;
    END IF;
  END LOOP;
  IF chosen IS NULL THEN
    chosen := make_date(yr-1,12,30);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.welfare_deductions WHERE period_end = chosen) THEN
    INSERT INTO public.welfare_deductions(period_end) VALUES (chosen) RETURNING id INTO new_id;
    PERFORM public.notify_admins(
      'Welfare Deduction Approval',
      'প্রত্যেক active member এর কাছ থেকে ৳100 করে withdraw করে Fund এ deposit করা হবে। Approve / Reject করুন।',
      '/', 'welfare-' || new_id::text
    );
  END IF;
END;
$function$;

-- 3) Private schema for internal secrets (not exposed to Data API)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.internal_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.internal_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.internal_secrets TO service_role;

-- 4) Lookup function (restricted to service_role) so edge functions can read the secret
CREATE OR REPLACE FUNCTION public.get_internal_secret(_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.internal_secrets WHERE name = _name;
$$;
REVOKE ALL ON FUNCTION public.get_internal_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_secret(text) TO service_role;

-- 5) Push trigger now sends x-internal-secret header
CREATE OR REPLACE FUNCTION public.fire_push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  push_secret text;
BEGIN
  SELECT value INTO push_secret FROM private.internal_secrets WHERE name = 'send_push_secret';

  PERFORM net.http_post(
    url := 'https://oqfqyqlfepnzquldcjrv.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', coalesce(push_secret, '')
    ),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(NEW.user_id),
      'title', NEW.title,
      'body', NEW.message,
      'url', NEW.url,
      'tag', NEW.tag
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$function$;
