-- =====================================================================
-- ZUNO — Shop Opening Hours, Delivery Availability & Checkout Safety
-- Migration 00000000000014 (Phase 3 / SHOP-MVP-4)
--
-- Forward-only, idempotent migration. Does NOT alter historical 01-13.
-- Safe defaults for existing shops; preserves existing RLS and PII isolation.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Canonical Default Opening Hours Helper (24h, Asia/Kolkata MVP)
-- ---------------------------------------------------------------------
create or replace function public.default_shop_opening_hours()
returns jsonb as $$
begin
  return '{
    "monday":    { "enabled": true, "open": "08:00", "close": "21:00" },
    "tuesday":   { "enabled": true, "open": "08:00", "close": "21:00" },
    "wednesday": { "enabled": true, "open": "08:00", "close": "21:00" },
    "thursday":  { "enabled": true, "open": "08:00", "close": "21:00" },
    "friday":    { "enabled": true, "open": "08:00", "close": "21:00" },
    "saturday":  { "enabled": true, "open": "08:00", "close": "21:00" },
    "sunday":    { "enabled": true, "open": "08:00", "close": "21:00" }
  }'::jsonb;
end;
$$ language plpgsql immutable set search_path = public, pg_temp;

revoke all on function public.default_shop_opening_hours() from public;
grant execute on function public.default_shop_opening_hours() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Strict JSONB Opening Hours Validation Function
-- ---------------------------------------------------------------------
create or replace function public.is_valid_opening_hours(p_hours jsonb)
returns boolean as $$
declare
  v_days text[] := array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  v_day text;
  v_key text;
  v_slot jsonb;
  v_enabled boolean;
  v_open text;
  v_close text;
  v_key_count integer;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then
    return false;
  end if;

  select count(*) into v_key_count from jsonb_object_keys(p_hours);
  if v_key_count <> 7 then
    return false;
  end if;

  foreach v_day in array v_days loop
    if not (p_hours ? v_day) then
      return false;
    end if;

    v_slot := p_hours -> v_day;
    if v_slot is null or jsonb_typeof(v_slot) <> 'object' then
      return false;
    end if;

    -- Only allowed keys inside each weekday object: enabled, open, close
    for v_key in select jsonb_object_keys(v_slot) loop
      if v_key not in ('enabled', 'open', 'close') then
        return false;
      end if;
    end loop;

    if jsonb_typeof(v_slot -> 'enabled') <> 'boolean' then
      return false;
    end if;

    v_enabled := (v_slot ->> 'enabled')::boolean;

    if v_enabled then
      if jsonb_typeof(v_slot -> 'open') <> 'string'
         or jsonb_typeof(v_slot -> 'close') <> 'string' then
        return false;
      end if;

      v_open := v_slot ->> 'open';
      v_close := v_slot ->> 'close';

      if v_open !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or v_close !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        return false;
      end if;

      -- Zero-duration windows (same open & close time) are invalid;
      -- both same-day (open < close) and overnight/midnight wrap (open > close) are supported.
      if v_open = v_close then
        return false;
      end if;
    else
      if (v_slot ? 'open') and jsonb_typeof(v_slot -> 'open') <> 'null' then
        return false;
      end if;
      if (v_slot ? 'close') and jsonb_typeof(v_slot -> 'close') <> 'null' then
        return false;
      end if;
    end if;
  end loop;

  return true;
end;
$$ language plpgsql immutable set search_path = public, pg_temp;

revoke all on function public.is_valid_opening_hours(jsonb) from public;
grant execute on function public.is_valid_opening_hours(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Business-Timezone ('Asia/Kolkata') Open-Status Evaluator
-- ---------------------------------------------------------------------
create or replace function public.is_shop_open_now(
  p_hours jsonb,
  p_at timestamptz default now()
)
returns boolean as $$
declare
  v_ist timestamp;
  v_dow integer;
  v_days text[] := array['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  v_today_key text;
  v_prev_key text;
  v_now_min integer;
  v_slot jsonb;
  v_prev_slot jsonb;
  v_open_min integer;
  v_close_min integer;
begin
  -- Legacy null fallback: active shops without configured hours remain open
  if p_hours is null then
    return true;
  end if;

  if not public.is_valid_opening_hours(p_hours) then
    return false;
  end if;

  v_ist := coalesce(p_at, now()) at time zone 'Asia/Kolkata';
  v_dow := extract(dow from v_ist)::integer; -- 0 = sunday .. 6 = saturday
  v_today_key := v_days[v_dow + 1];
  v_prev_key := v_days[((v_dow + 6) % 7) + 1];
  v_now_min := (extract(hour from v_ist)::integer * 60) + extract(minute from v_ist)::integer;

  v_slot := p_hours -> v_today_key;
  if coalesce((v_slot ->> 'enabled')::boolean, false) then
    v_open_min := (split_part(v_slot ->> 'open', ':', 1)::integer * 60)
                + split_part(v_slot ->> 'open', ':', 2)::integer;
    v_close_min := (split_part(v_slot ->> 'close', ':', 1)::integer * 60)
                 + split_part(v_slot ->> 'close', ':', 2)::integer;

    if v_open_min < v_close_min then
      if v_now_min >= v_open_min and v_now_min < v_close_min then
        return true;
      end if;
    elsif v_open_min > v_close_min then
      if v_now_min >= v_open_min then
        return true;
      end if;
    end if;
  end if;

  -- Check carry-over tail from yesterday's overnight/midnight-crossing schedule
  v_prev_slot := p_hours -> v_prev_key;
  if coalesce((v_prev_slot ->> 'enabled')::boolean, false) then
    v_open_min := (split_part(v_prev_slot ->> 'open', ':', 1)::integer * 60)
                + split_part(v_prev_slot ->> 'open', ':', 2)::integer;
    v_close_min := (split_part(v_prev_slot ->> 'close', ':', 1)::integer * 60)
                 + split_part(v_prev_slot ->> 'close', ':', 2)::integer;

    if v_open_min > v_close_min and v_now_min < v_close_min then
      return true;
    end if;
  end if;

  return false;
end;
$$ language plpgsql stable set search_path = public, pg_temp;

revoke all on function public.is_shop_open_now(jsonb, timestamptz) from public;
grant execute on function public.is_shop_open_now(jsonb, timestamptz) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Add Opening Hours & Delivery Availability Columns on public.shops
-- ---------------------------------------------------------------------
alter table public.shops
  add column if not exists opening_hours jsonb not null default public.default_shop_opening_hours();

alter table public.shops
  add column if not exists is_delivery_available boolean not null default true;

update public.shops
set opening_hours = public.default_shop_opening_hours()
where opening_hours is null;

update public.shops
set is_delivery_available = true
where is_delivery_available is null;

alter table public.shops drop constraint if exists shops_opening_hours_valid_chk;
alter table public.shops
  add constraint shops_opening_hours_valid_chk
  check (public.is_valid_opening_hours(opening_hours));

-- ---------------------------------------------------------------------
-- 5. Update Column-Safe Public Storefronts View
--    Appends is_delivery_available & opening_hours at end so existing
--    column ordering remains backward-compatible. Keeps security_barrier,
--    PII exclusions, and blocks anon direct SELECT on public.shops.
-- ---------------------------------------------------------------------
revoke all on public.shops from anon;

create or replace view public.public_storefronts
with (security_barrier = true) as
select
  s.id,
  s.name,
  s.description,
  s.locality,
  s.pincode,
  s.is_active,
  s.lat,
  s.lng,
  s.service_area_id,
  s.is_delivery_available,
  s.opening_hours
from public.shops s
where s.is_approved = true
  and s.approval_status = 'APPROVED'
  and s.is_active = true;

revoke all on public.public_storefronts from public, anon, authenticated;
grant select on public.public_storefronts to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Server-Side Order Creation Guard (BEFORE INSERT on public.orders)
--    Validates live shop approval, is_active, is_delivery_available, and
--    opening_hours in Asia/Kolkata at order creation time.
--    Runs ONLY on INSERT, leaving historical orders unaffected by later
--    schedule or delivery availability updates.
-- ---------------------------------------------------------------------
create or replace function public.enforce_order_shop_availability()
returns trigger as $$
declare
  v_shop record;
begin
  select
    s.id,
    s.is_approved,
    s.approval_status,
    s.is_active,
    s.is_delivery_available,
    s.opening_hours
  into v_shop
  from public.shops s
  where s.id = NEW.shop_id;

  if not found or not v_shop.is_approved or v_shop.approval_status <> 'APPROVED' then
    raise exception 'This shop is not available to accept orders.'
      using errcode = 'P0001';
  end if;

  if not v_shop.is_active then
    raise exception 'This shop is currently offline and not accepting orders.'
      using errcode = 'P0001';
  end if;

  if not v_shop.is_delivery_available then
    raise exception 'Delivery is temporarily paused by this shop.'
      using errcode = 'P0001';
  end if;

  if not public.is_shop_open_now(v_shop.opening_hours, now()) then
    raise exception 'This shop is currently closed according to its opening hours.'
      using errcode = 'P0001';
  end if;

  return NEW;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function public.enforce_order_shop_availability() from public;

drop trigger if exists trigger_enforce_order_shop_availability on public.orders;
create trigger trigger_enforce_order_shop_availability
  before insert on public.orders
  for each row execute function public.enforce_order_shop_availability();

