-- =====================================================================
-- ZUNO — Secure Customer Order Creation, Idempotency & Multi-Shop Co-Owner RLS
-- Migration 00000000000015 (Phase 5 / SHOP-MVP-6)
--
-- Remediates:
-- - BUG-001 (P0): Blocks raw untrusted customer INSERTs on public.orders and
--   public.order_items; introduces atomic server-authoritative RPC
--   public.create_customer_order(uuid, uuid, jsonb, text).
-- - BUG-003 (P1): Allows verified shop co-owners (shop_members role='OWNER')
--   alongside primary owners to update shop operational settings without
--   weakening trigger_shops_approval_protection or exposing admin/approval fields.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Idempotency Support on public.orders
-- ---------------------------------------------------------------------
alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists idx_orders_customer_idempotency_key
  on public.orders (customer_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_shop_products_available_shop
  on public.shop_products (shop_id, available)
  where available = true;

-- ---------------------------------------------------------------------
-- 2. Align Co-Owner Shop Update RLS (BUG-003)
--    Uses SECURITY DEFINER helper with explicit p_shop_id to avoid column
--    shadowing or policy recursion between shops and shop_members.
--    trigger_shops_approval_protection continues to block owner_id,
--    is_approved, and approval_status changes by non-admins.
-- ---------------------------------------------------------------------
create or replace function public.is_shop_co_owner(p_shop_id uuid)
returns boolean as $$
begin
  if auth.uid() is null or p_shop_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.shop_members sm
    where sm.shop_id = p_shop_id
      and sm.user_id = auth.uid()
      and sm.role = 'OWNER'
  );
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke all on function public.is_shop_co_owner(uuid) from public;
grant execute on function public.is_shop_co_owner(uuid) to authenticated, service_role;

drop policy if exists "shops_update_owner" on public.shops;
create policy "shops_update_owner" on public.shops
  for update using (
    owner_id = auth.uid()
    or public.is_shop_co_owner(public.shops.id)
  )
  with check (
    owner_id = auth.uid()
    or public.is_shop_co_owner(public.shops.id)
  );

-- ---------------------------------------------------------------------
-- 3. Block Direct Untrusted Client Order & Order Item INSERTs
--    Customers must use public.create_customer_order(...) exclusively.
-- ---------------------------------------------------------------------
revoke insert on public.orders from public, anon, authenticated;
revoke insert on public.order_items from public, anon, authenticated;

drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "orders_insert_deny_direct" on public.orders;
create policy "orders_insert_deny_direct" on public.orders
  for insert to anon, authenticated
  with check (false);

drop policy if exists "order_items_insert_own" on public.order_items;
drop policy if exists "order_items_insert_deny_direct" on public.order_items;
create policy "order_items_insert_deny_direct" on public.order_items
  for insert to anon, authenticated
  with check (false);

-- Defense-in-depth BEFORE INSERT trigger ensuring financial consistency &
-- non-forged status if called via RPC or privileged paths.
create or replace function public.enforce_order_insert_integrity()
returns trigger as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception 'Direct order creation is not allowed. Use checkout RPC.'
      using errcode = '42501';
  end if;

  if NEW.subtotal is null or NEW.subtotal < 0
     or NEW.delivery_fee is null or NEW.delivery_fee < 0
     or NEW.total is null or NEW.total < 0 then
    raise exception 'Order financial values must be non-negative.'
      using errcode = '22023';
  end if;

  if round(NEW.total, 2) <> round(NEW.subtotal + NEW.delivery_fee, 2) then
    raise exception 'Order total mismatch.'
      using errcode = '22023';
  end if;

  return NEW;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function public.enforce_order_insert_integrity() from public;

drop trigger if exists trigger_enforce_order_insert_integrity on public.orders;
create trigger trigger_enforce_order_insert_integrity
  before insert on public.orders
  for each row execute function public.enforce_order_insert_integrity();

-- ---------------------------------------------------------------------
-- 3b. Harden shop_products staff trigger (SECURITY INVOKER) so trusted
--     server-side SECURITY DEFINER stock reservation in create_customer_order
--     can atomically decrement stock without weakening client/staff rules.
-- ---------------------------------------------------------------------
create or replace function public.check_shop_products_staff_permissions()
returns trigger as $$
declare
  v_is_primary_owner boolean;
  v_member_role text;
begin
  if (OLD.shop_id is distinct from NEW.shop_id or OLD.product_id is distinct from NEW.product_id) then
    raise exception 'shop_id and product_id cannot be reassigned.';
  end if;

  if current_user in ('postgres', 'service_role') then
    return NEW;
  end if;

  if public.is_admin_or_super(auth.uid()) then
    return NEW;
  end if;

  select (owner_id = auth.uid()) into v_is_primary_owner
  from public.shops
  where id = OLD.shop_id;

  if (v_is_primary_owner is true) then
    return NEW;
  end if;

  select role into v_member_role
  from public.shop_members
  where shop_id = OLD.shop_id and user_id = auth.uid();

  if (v_member_role = 'OWNER') then
    return NEW;
  elsif (v_member_role = 'STAFF') then
    if (OLD.price is distinct from NEW.price) then
      raise exception 'Staff members are not authorized to modify product prices.';
    end if;
    return NEW;
  else
    raise exception 'Unauthorized catalog modification.';
  end if;
end;
$$ language plpgsql security invoker set search_path = public, pg_temp;

revoke all on function public.check_shop_products_staff_permissions() from public;
grant execute on function public.check_shop_products_staff_permissions() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Atomic Server-Authoritative Order Creation RPC
--    - Derives customer_id strictly from auth.uid() (role = 'CUSTOMER')
--    - Verifies address belongs to auth.uid()
--    - Verifies shop approval, is_active, is_delivery_available, and
--      opening_hours in Asia/Kolkata with row share lock
--    - Reads authoritative prices from public.shop_products and stock from
--      shop_products / inventory with deterministic row ordering FOR UPDATE
--    - Computes subtotal, delivery_fee (>=500 free else 20), and total
--    - Enforces initial status = 'PLACED'
--    - Deduplicates cleanly via idempotency_key
-- ---------------------------------------------------------------------
create or replace function public.create_customer_order(
  p_shop_id uuid,
  p_address_id uuid,
  p_items jsonb,
  p_idempotency_key text default null
) returns jsonb as $$
declare
  v_customer_id uuid := auth.uid();
  v_role user_role;
  v_idem_key text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_existing public.orders%rowtype;
  v_shop public.shops%rowtype;
  v_address_owner uuid;
  v_item_count integer;
  v_elem jsonb;
  v_sp_id uuid;
  v_qty_raw text;
  v_qty integer;
  v_req_ids uuid[] := '{}'::uuid[];
  v_req_qtys integer[] := '{}'::integer[];
  v_locked record;
  v_matched_count integer := 0;
  v_available_stock integer;
  v_new_stock integer;
  v_line_subtotal numeric(10, 2);
  v_subtotal numeric(10, 2) := 0;
  v_delivery_fee numeric(10, 2) := 0;
  v_total numeric(10, 2) := 0;
  v_order_id uuid;
  v_created_at timestamptz;
  v_idx integer;
  v_item_quantities jsonb := '{}'::jsonb;
  v_snapshot_items jsonb := '[]'::jsonb;
begin
  -- A. Authentication and CUSTOMER role verification
  if v_customer_id is null then
    raise exception 'Authentication required to place an order.'
      using errcode = '42501';
  end if;

  select role into v_role
  from public.profiles
  where id = v_customer_id;

  if not found or v_role <> 'CUSTOMER' then
    raise exception 'Only authenticated customer accounts can place orders.'
      using errcode = '42501';
  end if;

  -- B. Basic parameter validation
  if p_shop_id is null then
    raise exception 'Shop identifier is required.'
      using errcode = '22023';
  end if;

  if p_address_id is null then
    raise exception 'Delivery address is required.'
      using errcode = '22023';
  end if;

  if v_idem_key is not null and char_length(v_idem_key) > 128 then
    raise exception 'Idempotency key is invalid or too long.'
      using errcode = '22023';
  end if;

  -- C. Idempotency check with transaction-scoped advisory lock
  if v_idem_key is not null then
    perform pg_advisory_xact_lock(hashtext(v_customer_id::text || ':' || v_idem_key));

    select * into v_existing
    from public.orders
    where customer_id = v_customer_id
      and idempotency_key = v_idem_key;

    if found then
      return jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'order_id', v_existing.id,
        'shop_id', v_existing.shop_id,
        'status', v_existing.status,
        'subtotal', v_existing.subtotal,
        'delivery_fee', v_existing.delivery_fee,
        'total', v_existing.total,
        'created_at', v_existing.created_at
      );
    end if;
  end if;

  -- D. Verify customer owns the selected delivery address
  select user_id into v_address_owner
  from public.addresses
  where id = p_address_id;

  if not found or v_address_owner <> v_customer_id then
    raise exception 'Delivery address not found or unauthorized.'
      using errcode = '42501';
  end if;

  -- E. Verify live shop availability (locks shop row against concurrent flag toggles)
  select * into v_shop
  from public.shops
  where id = p_shop_id
  for share;

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

  -- F. Validate items payload (reject empty, malformed, duplicate, or bad qty)
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Order items must be a non-empty array.'
      using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 100 then
    raise exception 'Order must contain between 1 and 100 items.'
      using errcode = '22023';
  end if;

  for v_idx in 0..(v_item_count - 1) loop
    v_elem := p_items -> v_idx;
    if v_elem is null or jsonb_typeof(v_elem) <> 'object' then
      raise exception 'Each order item must be a valid object.'
        using errcode = '22023';
    end if;

    begin
      v_sp_id := (v_elem ->> 'shop_product_id')::uuid;
    exception when others then
      raise exception 'Invalid shop_product_id in order items.'
        using errcode = '22023';
    end;

    if v_sp_id is null then
      raise exception 'shop_product_id is required for every order item.'
        using errcode = '22023';
    end if;

    v_qty_raw := v_elem ->> 'quantity';
    if v_qty_raw is null or v_qty_raw !~ '^\d+$' then
      raise exception 'Item quantity must be a positive integer.'
        using errcode = '22023';
    end if;

    v_qty := v_qty_raw::integer;
    if v_qty <= 0 or v_qty > 1000 then
      raise exception 'Item quantity must be between 1 and 1000.'
        using errcode = '22023';
    end if;

    if v_sp_id = any(v_req_ids) then
      raise exception 'Duplicate product entries are not permitted in one order.'
        using errcode = '22023';
    end if;

    v_req_ids := array_append(v_req_ids, v_sp_id);
    v_req_qtys := array_append(v_req_qtys, v_qty);
    v_item_quantities := v_item_quantities || jsonb_build_object(v_sp_id::text, v_qty);
  end loop;

  -- G. Lock listings & inventory in deterministic UUID order (deadlock-free)
  for v_locked in
    select
      sp.id as shop_product_id,
      sp.shop_id,
      sp.product_id,
      sp.price,
      sp.stock,
      sp.available,
      p.name as product_name,
      p.unit as product_unit,
      inv.id as inventory_id,
      inv.quantity as inventory_quantity
    from public.shop_products sp
    join public.products p on p.id = sp.product_id
    left join public.inventory inv on inv.shop_product_id = sp.id
    where sp.id = any(v_req_ids)
    order by sp.id asc
    for update of sp
  loop
    v_matched_count := v_matched_count + 1;

    if v_locked.shop_id <> p_shop_id then
      raise exception 'Product listing % does not belong to the selected shop.', v_locked.shop_product_id
        using errcode = 'P0001';
    end if;

    if not v_locked.available then
      raise exception 'Item "%" is currently unavailable at this shop.', v_locked.product_name
        using errcode = 'P0001';
    end if;

    v_qty := (v_item_quantities ->> v_locked.shop_product_id::text)::integer;

    v_available_stock := case
      when v_locked.inventory_id is not null
        then least(v_locked.stock, coalesce(v_locked.inventory_quantity, 0))
      else v_locked.stock
    end;

    if v_available_stock < v_qty then
      raise exception 'Insufficient stock for "%". Available: %.', v_locked.product_name, greatest(v_available_stock, 0)
        using errcode = 'P0001';
    end if;

    v_new_stock := v_available_stock - v_qty;

    update public.shop_products
    set stock = v_new_stock,
        available = (v_new_stock > 0)
    where id = v_locked.shop_product_id;

    if v_locked.inventory_id is not null then
      update public.inventory
      set quantity = v_new_stock,
          updated_at = now()
      where id = v_locked.inventory_id;
    end if;

    v_line_subtotal := round((v_locked.price * v_qty)::numeric, 2);
    v_subtotal := round((v_subtotal + v_line_subtotal)::numeric, 2);

    v_snapshot_items := v_snapshot_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_locked.product_id,
        'product_name_snapshot', v_locked.product_name,
        'unit_price_snapshot', v_locked.price,
        'quantity', v_qty,
        'subtotal', v_line_subtotal
      )
    );
  end loop;

  if v_matched_count <> v_item_count then
    raise exception 'One or more selected products were not found.'
      using errcode = 'P0001';
  end if;

  -- H. Server-authoritative delivery fee & total (MVP rule: free >= 500, else 20)
  v_delivery_fee := case when v_subtotal >= 500 then 0.00 else 20.00 end;
  v_total := round((v_subtotal + v_delivery_fee)::numeric, 2);

  -- I. Create order (strictly PLACED) and immutable order_items snapshots
  insert into public.orders (
    customer_id,
    shop_id,
    address_id,
    status,
    subtotal,
    delivery_fee,
    total,
    idempotency_key
  ) values (
    v_customer_id,
    p_shop_id,
    p_address_id,
    'PLACED',
    v_subtotal,
    v_delivery_fee,
    v_total,
    v_idem_key
  )
  returning id, created_at into v_order_id, v_created_at;

  insert into public.order_items (
    order_id,
    product_id,
    product_name_snapshot,
    unit_price_snapshot,
    quantity,
    subtotal
  )
  select
    v_order_id,
    (elem ->> 'product_id')::uuid,
    elem ->> 'product_name_snapshot',
    (elem ->> 'unit_price_snapshot')::numeric(10, 2),
    (elem ->> 'quantity')::integer,
    (elem ->> 'subtotal')::numeric(10, 2)
  from jsonb_array_elements(v_snapshot_items) as elem;

  return jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'order_id', v_order_id,
    'shop_id', p_shop_id,
    'shop_name', v_shop.name,
    'status', 'PLACED',
    'subtotal', v_subtotal,
    'delivery_fee', v_delivery_fee,
    'total', v_total,
    'created_at', v_created_at
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function public.create_customer_order(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.create_customer_order(uuid, uuid, jsonb, text) to authenticated, service_role;
