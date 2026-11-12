-- =====================================================================
-- ZUNO — P0 Security, RLS Recursion & Least-Privilege Read Remediation
-- Migration 00000000000013
-- Forward-only migration addressing PHASE SHOP-AUDIT-1 P0-A through P0-G.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Non-Recursive Authorization Helpers (SECURITY DEFINER)
--    Each helper sets an explicit search_path, verifies auth.uid(),
--    uses fully qualified table names, and avoids circular RLS evaluation.
-- ---------------------------------------------------------------------

create or replace function public.is_shop_owner_or_member(p_shop_id uuid)
returns boolean as $$
begin
  if auth.uid() is null or p_shop_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.owner_id = auth.uid()
  ) or exists (
    select 1
    from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_shop_owner_or_member(uuid) from public;
grant execute on function public.is_shop_owner_or_member(uuid) to authenticated;

create or replace function public.is_customer_of_order(p_order_id uuid)
returns boolean as $$
begin
  if auth.uid() is null or p_order_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and o.customer_id = auth.uid()
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_customer_of_order(uuid) from public;
grant execute on function public.is_customer_of_order(uuid) to authenticated;

create or replace function public.is_shopkeeper_of_order(p_order_id uuid)
returns boolean as $$
begin
  if auth.uid() is null or p_order_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.orders o
    join public.shops s on s.id = o.shop_id
    where o.id = p_order_id
      and (
        s.owner_id = auth.uid()
        or exists (
          select 1
          from public.shop_members sm
          where sm.shop_id = s.id
            and sm.user_id = auth.uid()
        )
      )
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_shopkeeper_of_order(uuid) from public;
grant execute on function public.is_shopkeeper_of_order(uuid) to authenticated;

-- Queries deliveries + delivery_partners ONLY (never touches public.orders)
create or replace function public.is_assigned_delivery_partner_for_order(p_order_id uuid)
returns boolean as $$
begin
  if auth.uid() is null or p_order_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.deliveries d
    join public.delivery_partners dp on dp.id = d.delivery_partner_id
    where d.order_id = p_order_id
      and dp.user_id = auth.uid()
      and dp.approval_status = 'APPROVED'
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_assigned_delivery_partner_for_order(uuid) from public;
grant execute on function public.is_assigned_delivery_partner_for_order(uuid) to authenticated;

create or replace function public.is_approved_delivery_partner()
returns boolean as $$
begin
  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.delivery_partners dp
    where dp.user_id = auth.uid()
      and dp.approval_status = 'APPROVED'
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_approved_delivery_partner() from public;
grant execute on function public.is_approved_delivery_partner() to authenticated;

create or replace function public.is_delivery_partner_for_shop(p_shop_id uuid)
returns boolean as $$
begin
  if auth.uid() is null or p_shop_id is null then
    return false;
  end if;

  -- Restrict public.shops read access to approved riders assigned to an order at this shop
  return exists (
    select 1
    from public.delivery_partners dp
    join public.deliveries d on d.delivery_partner_id = dp.id
    join public.orders o on o.id = d.order_id
    where dp.user_id = auth.uid()
      and dp.approval_status = 'APPROVED'
      and o.shop_id = p_shop_id
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_delivery_partner_for_shop(uuid) from public;
grant execute on function public.is_delivery_partner_for_shop(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. P0-A: Break Orders <-> Deliveries Mutual RLS Recursion (42P17)
-- ---------------------------------------------------------------------

-- Orders SELECT policies (never subquery public.deliveries directly)
drop policy if exists "orders_select_own" on public.orders;
create policy "orders_select_own" on public.orders
  for select using (auth.uid() = customer_id);

drop policy if exists "orders_select_shopkeeper" on public.orders;
create policy "orders_select_shopkeeper" on public.orders
  for select using (public.is_shop_owner_or_member(shop_id));

drop policy if exists "orders_select_delivery_partner" on public.orders;
create policy "orders_select_delivery_partner" on public.orders
  for select using (public.is_assigned_delivery_partner_for_order(id));

drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin" on public.orders
  for select using (public.is_admin_or_super(auth.uid()));

-- Tighten shopkeeper update policy with explicit WITH CHECK
drop policy if exists "orders_update_shopkeeper" on public.orders;
create policy "orders_update_shopkeeper" on public.orders
  for update using (public.is_shop_owner_or_member(shop_id))
  with check (public.is_shop_owner_or_member(shop_id));

-- Deliveries SELECT policies (never subquery public.orders directly)
drop policy if exists "deliveries_select_own" on public.deliveries;
create policy "deliveries_select_own" on public.deliveries
  for select using (public.is_customer_of_order(order_id));

drop policy if exists "deliveries_select_shopkeeper" on public.deliveries;
create policy "deliveries_select_shopkeeper" on public.deliveries
  for select using (public.is_shopkeeper_of_order(order_id));

drop policy if exists "deliveries_select_partner" on public.deliveries;
create policy "deliveries_select_partner" on public.deliveries
  for select using (
    (status = 'UNASSIGNED' and public.is_approved_delivery_partner())
    or exists (
      select 1
      from public.delivery_partners dp
      where dp.id = deliveries.delivery_partner_id
        and dp.user_id = auth.uid()
        and dp.approval_status = 'APPROVED'
    )
  );

drop policy if exists "deliveries_select_admin" on public.deliveries;
create policy "deliveries_select_admin" on public.deliveries
  for select using (public.is_admin_or_super(auth.uid()));

-- Order Items SELECT policies
drop policy if exists "order_items_select_own" on public.order_items;
create policy "order_items_select_own" on public.order_items
  for select using (public.is_customer_of_order(order_id));

drop policy if exists "order_items_select_shopkeeper" on public.order_items;
create policy "order_items_select_shopkeeper" on public.order_items
  for select using (
    public.is_shopkeeper_of_order(order_id)
    or public.is_admin_or_super(auth.uid())
  );

drop policy if exists "order_items_select_delivery_partner" on public.order_items;
create policy "order_items_select_delivery_partner" on public.order_items
  for select using (public.is_assigned_delivery_partner_for_order(order_id));

-- Order Status History SELECT policies
drop policy if exists "order_status_history_select_own" on public.order_status_history;
create policy "order_status_history_select_own" on public.order_status_history
  for select using (public.is_customer_of_order(order_id));

drop policy if exists "order_status_history_select_shopkeeper" on public.order_status_history;
create policy "order_status_history_select_shopkeeper" on public.order_status_history
  for select using (
    public.is_shopkeeper_of_order(order_id)
    or public.is_admin_or_super(auth.uid())
  );

drop policy if exists "order_status_history_select_delivery_partner" on public.order_status_history;
create policy "order_status_history_select_delivery_partner" on public.order_status_history
  for select using (public.is_assigned_delivery_partner_for_order(order_id));

-- Payments SELECT policies (admins + customer owner only; shopkeeper uses scoped RPC excluding provider_reference)
drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select using (public.is_customer_of_order(order_id));

drop policy if exists "payments_select_admin" on public.payments;
create policy "payments_select_admin" on public.payments
  for select using (public.is_admin_or_super(auth.uid()));

-- ---------------------------------------------------------------------
-- 3. P0-B: Lock Down Shop Approval RPC (approve_or_reject_shop)
-- ---------------------------------------------------------------------
create or replace function public.approve_or_reject_shop(
  p_shop_id uuid,
  p_status text
) returns jsonb as $$
declare
  v_shop record;
  v_is_approved boolean := (p_status = 'APPROVED');
  v_caller_id uuid := auth.uid();
begin
  -- Fail closed before reading any shop record
  if v_caller_id is null or not public.is_admin_or_super(v_caller_id) then
    raise exception 'Unauthorized: Administrator privileges required.'
      using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('APPROVED', 'REJECTED', 'SUSPENDED') then
    return jsonb_build_object('success', false, 'error', 'Invalid approval status.');
  end if;

  select id, owner_id, name, approval_status
  into v_shop
  from public.shops
  where id = p_shop_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Shop record not found.');
  end if;

  -- Anti-self-approval invariant
  if v_shop.owner_id = v_caller_id then
    return jsonb_build_object('success', false, 'error', 'Security Violation: Shop owners cannot alter their own approval status.');
  end if;

  update public.shops
  set is_approved = v_is_approved,
      approval_status = p_status,
      updated_at = now()
  where id = p_shop_id;

  insert into public.activity_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_caller_id,
    'SHOP_APPROVAL_MODIFICATION',
    'shops',
    p_shop_id,
    jsonb_build_object(
      'previous_status', v_shop.approval_status,
      'new_status', p_status,
      'is_approved', v_is_approved
    )
  );

  return jsonb_build_object(
    'success', true,
    'message', 'Shop status updated to ' || p_status,
    'shop_id', p_shop_id,
    'approval_status', p_status,
    'is_approved', v_is_approved
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function public.approve_or_reject_shop(uuid, text) from public, anon;
grant execute on function public.approve_or_reject_shop(uuid, text) to authenticated, service_role;

-- Harden shops approval trigger: SECURITY INVOKER ensures current_user reflects the
-- actual updater (so 'authenticated' cannot masquerade as 'postgres' via SECURITY DEFINER).
create or replace function public.check_shops_approval_protection()
returns trigger as $$
begin
  if (OLD.is_approved is distinct from NEW.is_approved or OLD.approval_status is distinct from NEW.approval_status) then
    if not public.is_admin_or_super(auth.uid()) then
      if auth.uid() is null and current_user in ('postgres', 'service_role') then
        null; -- Trusted server migration / service_role operation
      else
        raise exception 'Only platform administrators can modify shop approval status.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if (OLD.owner_id is distinct from NEW.owner_id) then
    if not public.is_admin_or_super(auth.uid()) then
      if auth.uid() is null and current_user in ('postgres', 'service_role') then
        null;
      else
        raise exception 'Shop ownership cannot be transferred without administrator approval.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security invoker set search_path = public, pg_temp;

revoke all on function public.check_shops_approval_protection() from public;
grant execute on function public.check_shops_approval_protection() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. P0-C: Secure Shop Registration RPC (register_shop_application)
--    Server-only service_role provisioning OR strictly self-matched
--    authenticated shopkeeper without claiming existing accounts.
-- ---------------------------------------------------------------------
create or replace function public.register_shop_application(
  p_owner_name text,
  p_phone text,
  p_shop_name text,
  p_description text default 'Fresh local grocery & daily essentials',
  p_address_line text default 'Main Market',
  p_locality text default 'Renukoot',
  p_pincode text default '231217'
) returns jsonb as $$
declare
  v_caller_id uuid := auth.uid();
  v_is_service boolean := (current_user in ('postgres', 'service_role') or session_user in ('postgres', 'service_role'));
  v_user_id uuid;
  v_shop_id uuid;
  v_clean_digits text;
  v_clean10 text;
  v_normalized_e164 text;
  v_existing_role user_role;
  v_primary_email text;
  v_legacy_email text;
  v_auth_phone text;
  v_auth_email text;
begin
  -- Reject unauthenticated non-service callers immediately
  if v_caller_id is null and not v_is_service then
    raise exception 'Authentication required for shop registration.'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_owner_name, ''))) < 2 then
    raise exception 'Owner full name must be at least 2 characters.';
  end if;

  if length(trim(coalesce(p_shop_name, ''))) < 2 then
    raise exception 'Shop name must be at least 2 characters.';
  end if;

  v_clean_digits := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  if length(v_clean_digits) < 10 then
    raise exception 'Valid 10-digit Indian mobile number is required.';
  end if;
  v_clean10 := right(v_clean_digits, 10);
  if v_clean10 !~ '^[6-9][0-9]{9}$' then
    raise exception 'Valid 10-digit Indian mobile number starting with 6-9 is required.';
  end if;

  v_normalized_e164 := '+91' || v_clean10;
  v_primary_email := 'shop_91' || v_clean10 || '@zuno.in';
  v_legacy_email := 'shop_' || v_clean10 || '@zuno.in';

  if v_caller_id is not null then
    -- Authenticated self-registration: caller may only act on own verified Auth identity
    select id, phone, email
    into v_user_id, v_auth_phone, v_auth_email
    from auth.users
    where id = v_caller_id;

    if not found then
      raise exception 'Authenticated account not found.';
    end if;

    if coalesce(regexp_replace(coalesce(v_auth_phone, ''), '\D', '', 'g'), '') not in (v_clean10, '91' || v_clean10)
       and lower(coalesce(v_auth_email, '')) not in (v_primary_email, v_legacy_email) then
      raise exception 'Authenticated identity does not match the submitted mobile number.'
        using errcode = '42501';
    end if;
  else
    -- Server-side service_role path: Auth user must already be provisioned for this synthetic identity
    select id
    into v_user_id
    from auth.users
    where lower(email) in (v_primary_email, v_legacy_email)
    order by (lower(email) = v_primary_email) desc, created_at desc
    limit 1;

    if v_user_id is null then
      raise exception 'Shopkeeper auth identity must be provisioned prior to shop registration.';
    end if;
  end if;

  -- Never overwrite existing CUSTOMER, DELIVERY, ADMIN, or SUPER_ADMIN roles
  select role into v_existing_role
  from public.profiles
  where id = v_user_id;

  if found and v_existing_role <> 'SHOPKEEPER' then
    raise exception 'Existing % account cannot be converted into a shopkeeper account.', v_existing_role
      using errcode = '42501';
  end if;

  -- Prevent duplicate shops for the same owner or mobile number
  if exists (
    select 1
    from public.shops s
    where s.owner_id = v_user_id
       or regexp_replace(coalesce(s.phone, ''), '\D', '', 'g') in (v_clean10, '91' || v_clean10)
  ) then
    raise exception 'A shop application already exists for this account or mobile number.'
      using errcode = '23505';
  end if;

  insert into public.profiles (id, role, full_name, phone, updated_at)
  values (v_user_id, 'SHOPKEEPER', trim(p_owner_name), v_normalized_e164, now())
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    updated_at = now()
  where public.profiles.role = 'SHOPKEEPER';

  insert into public.shops (
    owner_id,
    name,
    description,
    phone,
    address_line,
    locality,
    pincode,
    is_approved,
    approval_status,
    is_active,
    lat,
    lng
  ) values (
    v_user_id,
    trim(p_shop_name),
    coalesce(nullif(trim(p_description), ''), 'Fresh local grocery & daily essentials'),
    v_normalized_e164,
    coalesce(nullif(trim(p_address_line), ''), 'Main Market'),
    coalesce(nullif(trim(p_locality), ''), 'Renukoot'),
    coalesce(nullif(trim(p_pincode), ''), '231217'),
    false,
    'PENDING',
    true,
    24.2185,
    83.0326
  ) returning id into v_shop_id;

  return jsonb_build_object(
    'success', true,
    'shop_id', v_shop_id,
    'user_id', v_user_id,
    'shop_name', trim(p_shop_name),
    'approval_status', 'PENDING',
    'message', 'Shop registration submitted successfully.'
  );
end;
$$ language plpgsql security definer set search_path = public, auth, pg_temp;

revoke all on function public.register_shop_application(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.register_shop_application(text, text, text, text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. P0-D: Fix Shopkeeper Product & Inventory SELECT Policies
-- ---------------------------------------------------------------------
create or replace function public.is_shop_publicly_visible(p_shop_id uuid)
returns boolean as $$
begin
  if p_shop_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.is_active = true
      and s.is_approved = true
      and s.approval_status = 'APPROVED'
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_shop_publicly_visible(uuid) from public;
grant execute on function public.is_shop_publicly_visible(uuid) to anon, authenticated;

drop policy if exists "shop_products_select_public" on public.shop_products;
create policy "shop_products_select_public" on public.shop_products
  for select using (
    available = true
    and public.is_shop_publicly_visible(shop_id)
  );

drop policy if exists "shop_products_select_shopkeeper" on public.shop_products;
create policy "shop_products_select_shopkeeper" on public.shop_products
  for select using (
    public.is_shop_owner_or_member(shop_id)
    or public.is_admin_or_super(auth.uid())
  );

drop policy if exists "inventory_select_public" on public.inventory;
create policy "inventory_select_public" on public.inventory
  for select using (
    exists (
      select 1
      from public.shop_products sp
      where sp.id = inventory.shop_product_id
        and sp.available = true
        and public.is_shop_publicly_visible(sp.shop_id)
    )
  );

drop policy if exists "inventory_select_shopkeeper" on public.inventory;
create policy "inventory_select_shopkeeper" on public.inventory
  for select using (
    exists (
      select 1
      from public.shop_products sp
      where sp.id = inventory.shop_product_id
        and public.is_shop_owner_or_member(sp.shop_id)
    )
    or public.is_admin_or_super(auth.uid())
  );

-- ---------------------------------------------------------------------
-- 6. P0-F: Least-Privilege Customer, Address, Payment & Rider Reads
-- ---------------------------------------------------------------------

-- Narrow address policy: shopkeepers may read only addresses linked to orders for their shop
drop policy if exists "addresses_select_shopkeeper" on public.addresses;
create policy "addresses_select_shopkeeper" on public.addresses
  for select using (
    exists (
      select 1
      from public.orders o
      where o.address_id = addresses.id
        and public.is_shop_owner_or_member(o.shop_id)
    )
  );

-- Least-privilege read-only RPC returning ONLY operational order fulfillment context
-- Never exposes customer emails, unrelated addresses, payment provider tokens,
-- or rider phone numbers after delivery completion.
create or replace function public.get_shop_order_fulfillment_context(
  p_shop_id uuid,
  p_order_ids uuid[] default null
) returns table (
  order_id uuid,
  customer_name text,
  customer_phone text,
  delivery_address text,
  payment_method text,
  payment_status text,
  delivery_status text,
  rider_name text,
  rider_phone text,
  rider_vehicle_type text,
  rider_vehicle_number text
) as $$
begin
  if auth.uid() is null or p_shop_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if not public.is_shop_owner_or_member(p_shop_id) and not public.is_admin_or_super(auth.uid()) then
    raise exception 'Unauthorized access to shop order context.' using errcode = '42501';
  end if;

  return query
  select
    o.id as order_id,
    coalesce(nullif(trim(a.recipient_name), ''), nullif(trim(p.full_name), ''), 'Verified Customer') as customer_name,
    case
      when o.status in ('PLACED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY')
        then coalesce(nullif(trim(a.phone_number), ''), nullif(trim(p.phone), ''))
      else null
    end as customer_phone,
    coalesce(
      nullif(trim(d.dropoff_address), ''),
      nullif(
        concat_ws(
          ', ',
          nullif(trim(a.line1), ''),
          nullif(trim(a.line2), ''),
          nullif(trim(a.locality), ''),
          nullif(trim(concat_ws(' - ', nullif(trim(a.city), ''), nullif(trim(a.pincode), ''))), '')
        ),
        ''
      ),
      'Address unavailable'
    ) as delivery_address,
    pay.method::text as payment_method,
    pay.status::text as payment_status,
    d.status::text as delivery_status,
    dp.full_name as rider_name,
    case
      when d.delivery_partner_id is not null
        and o.status in ('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY')
        then dp.phone
      else null
    end as rider_phone,
    dp.vehicle_type as rider_vehicle_type,
    dp.vehicle_number as rider_vehicle_number
  from public.orders o
  left join public.profiles p on p.id = o.customer_id
  left join public.addresses a on a.id = o.address_id
  left join lateral (
    select pm.method, pm.status
    from public.payments pm
    where pm.id = o.payment_id or pm.order_id = o.id
    order by pm.created_at desc
    limit 1
  ) pay on true
  left join public.deliveries d on d.order_id = o.id
  left join public.delivery_partners dp on dp.id = d.delivery_partner_id
  where o.shop_id = p_shop_id
    and (p_order_ids is null or o.id = any(p_order_ids));
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.get_shop_order_fulfillment_context(uuid, uuid[]) from public, anon;
grant execute on function public.get_shop_order_fulfillment_context(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 7. P0-G: Separate Public Storefront Data from Private Shop Fields
-- ---------------------------------------------------------------------
drop policy if exists "shops_select_public" on public.shops;
drop policy if exists "shops_select_admin" on public.shops;

revoke all on public.shops from anon;

create policy "shops_select_owner_or_member" on public.shops
  for select using (public.is_shop_owner_or_member(id));

create policy "shops_select_admin" on public.shops
  for select using (public.is_admin_or_super(auth.uid()));

create policy "shops_select_delivery_partner" on public.shops
  for select using (public.is_delivery_partner_for_shop(id));

-- Public storefront projection: strictly excludes owner_id, phone,
-- address_line, is_approved, approval_status, and unapproved shops.
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
  s.service_area_id
from public.shops s
where s.is_approved = true
  and s.approval_status = 'APPROVED'
  and s.is_active = true;

revoke all on public.public_storefronts from public, anon, authenticated;
grant select on public.public_storefronts to anon, authenticated;

-- Tighten Migration 12 RPC so anon default EXECUTE privileges are revoked explicitly
revoke all on function public.upsert_shop_product_and_inventory(uuid, uuid, numeric, integer) from public, anon;
grant execute on function public.upsert_shop_product_and_inventory(uuid, uuid, numeric, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Rollback / Compensating Migration Strategy (Documentation Only)
--    If reverting Migration 013 is ever required:
--    1. DROP VIEW IF EXISTS public.public_storefronts;
--    2. DROP FUNCTION IF EXISTS public.get_shop_order_fulfillment_context(uuid, uuid[]);
--    3. Restore previous policies on shops/shop_products/inventory/orders/deliveries
--       only together with non-recursive helper functions so 42P17 does not recur.
-- ---------------------------------------------------------------------

