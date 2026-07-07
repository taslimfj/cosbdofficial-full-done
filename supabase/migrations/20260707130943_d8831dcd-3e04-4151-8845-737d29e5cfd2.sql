create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
alter table public.push_subscriptions enable row level security;
drop policy if exists "own subs read" on public.push_subscriptions;
create policy "own subs read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
drop policy if exists "own subs insert" on public.push_subscriptions;
create policy "own subs insert" on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "own subs delete" on public.push_subscriptions;
create policy "own subs delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
drop policy if exists "admin all subs" on public.push_subscriptions;
create policy "admin all subs" on public.push_subscriptions for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

alter table public.notifications add column if not exists url text;
alter table public.notifications add column if not exists tag text;

create or replace function public.fire_push_on_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://oqfqyqlfepnzquldcjrv.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object(
      'user_ids', jsonb_build_array(NEW.user_id),
      'title', NEW.title,
      'body', NEW.message,
      'url', NEW.url,
      'tag', NEW.tag
    )
  );
  return NEW;
exception when others then
  return NEW;
end;
$$;
drop trigger if exists on_notification_insert on public.notifications;
create trigger on_notification_insert after insert on public.notifications
for each row execute function public.fire_push_on_notification();

create or replace function public.notify_admins(_title text, _message text, _url text default null, _tag text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, message, url, tag)
  select ur.user_id, _title, _message, _url, _tag
  from public.user_roles ur where ur.role = 'admin';
end;
$$;

create or replace function public.tg_new_pending_deposit()
returns trigger language plpgsql security definer set search_path = public as $$
declare mname text;
begin
  if NEW.status = 'pending' then
    select full_name into mname from public.profiles where id = NEW.member_id;
    perform public.notify_admins('নতুন Deposit Approval',
      coalesce(mname,'একজন member') || ' ৳' || NEW.amount::text || ' deposit approval চেয়েছে',
      '/', 'deposit-' || NEW.id::text);
  end if; return NEW;
end;$$;
drop trigger if exists tg_deposit_pending on public.deposits;
create trigger tg_deposit_pending after insert on public.deposits for each row execute function public.tg_new_pending_deposit();

create or replace function public.tg_new_pending_member_loan()
returns trigger language plpgsql security definer set search_path = public as $$
declare mname text;
begin
  if NEW.status = 'pending' then
    select full_name into mname from public.profiles where id = NEW.member_id;
    perform public.notify_admins('নতুন Loan Request',
      coalesce(mname,'একজন member') || ' ৳' || NEW.requested_amount::text || ' loan request দিয়েছে',
      '/', 'mloan-' || NEW.id::text);
  end if; return NEW;
end;$$;
drop trigger if exists tg_mloan_pending on public.member_loans;
create trigger tg_mloan_pending after insert on public.member_loans for each row execute function public.tg_new_pending_member_loan();

create or replace function public.tg_new_pending_repayment()
returns trigger language plpgsql security definer set search_path = public as $$
declare mid uuid; mname text;
begin
  if NEW.status = 'pending' then
    select member_id into mid from public.member_loans where id = NEW.loan_id;
    select full_name into mname from public.profiles where id = mid;
    perform public.notify_admins('নতুন Loan Repayment',
      coalesce(mname,'একজন member') || ' ৳' || NEW.amount::text || ' repayment approval চেয়েছে',
      '/', 'mrepay-' || NEW.id::text);
  end if; return NEW;
end;$$;
drop trigger if exists tg_mrepay_pending on public.member_loan_repayments;
create trigger tg_mrepay_pending after insert on public.member_loan_repayments for each row execute function public.tg_new_pending_repayment();

create or replace function public.tg_new_customer_payment_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare lcode text;
begin
  if NEW.status = 'pending' then
    select code into lcode from public.islamic_loans where id = NEW.loan_id;
    perform public.notify_admins('Islamic Loan Payment Request',
      'Loan ' || coalesce(lcode,'') || ' এ ৳' || NEW.amount::text || ' payment approval এসেছে',
      '/islamic-loans/' || NEW.loan_id::text, 'cpr-' || NEW.id::text);
  end if; return NEW;
end;$$;
drop trigger if exists tg_cpr_pending on public.customer_payment_requests;
create trigger tg_cpr_pending after insert on public.customer_payment_requests for each row execute function public.tg_new_customer_payment_request();

create or replace function public.tg_new_project_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare pname text; mname text;
begin
  select name into pname from public.projects where id = NEW.project_id;
  select full_name into mname from public.profiles where id = NEW.created_by;
  perform public.notify_admins('Project Transaction',
    coalesce(mname,'কেউ একজন') || ' — ' || coalesce(pname,'Project') || ' এ ৳' || NEW.amount::text || ' (' || coalesce(NEW.type,'') || ') transaction করেছে',
    '/projects/' || NEW.project_id::text, 'ptx-' || NEW.id::text);
  return NEW;
end;$$;
drop trigger if exists tg_project_tx on public.project_transactions;
create trigger tg_project_tx after insert on public.project_transactions for each row execute function public.tg_new_project_transaction();