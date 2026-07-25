CREATE OR REPLACE FUNCTION public.tg_new_project_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  pname text;
  mname text;
  actor uuid;
begin
  select name into pname from public.projects where id = NEW.project_id;

  actor := coalesce(NEW.created_by, auth.uid());

  if actor is not null then
    select full_name into mname from public.profiles where id = actor;
    if mname is null or btrim(mname) = '' then
      select coalesce(nullif(raw_user_meta_data->>'full_name',''),
                      nullif(raw_user_meta_data->>'name',''),
                      email)
        into mname
      from auth.users where id = actor;
    end if;
  end if;

  perform public.notify_admins(
    'Project Transaction',
    coalesce(mname, 'একজন admin') || ' — ' || coalesce(pname,'Project')
      || ' এ ৳' || NEW.amount::text || ' (' || coalesce(NEW.type,'') || ') transaction করেছে',
    '/projects/' || NEW.project_id::text,
    'ptx-' || NEW.id::text
  );
  return NEW;
end;
$function$;