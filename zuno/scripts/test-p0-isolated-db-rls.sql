-- =====================================================================
-- ZUNO SHOP-P0 — Isolated PostgreSQL / Supabase RLS & RPC Test Harness
-- Target: Disposable local PostgreSQL database with migrations 01-13 applied.
-- Runs inside a rolled-back transaction (BEGIN ... ROLLBACK).
-- =====================================================================

\set ON_ERROR_STOP on

begin;

-- Ensure minimal auth schema helpers exist on standalone PostgreSQL test instances
create schema if not exists auth;
create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ language sql stable;

-- Test UUIDs
\set CUST_1 '10000000-0000-4000-a000-000000000001'
\set CUST_2 '10000000-0000-4000-a000-000000000002'
\set USER_OTHER '10000000-0000-4000-a000-000000000099'
\set OWNER_1 '20000000-0000-4000-a000-000000000001'
\set OWNER_2 '20000000-0000-4000-a000-000000000002'
\set OWNER_NEW '20000000-0000-4000-a000-000000000003'
\set RIDER_1 '30000000-0000-4000-a000-000000000001'
\set RIDER_2 '30000000-0000-4000-a000-000000000002'
\set ADMIN_1 '40000000-0000-4000-a000-000000000001'
\set SHOP_1 '50000000-0000-4000-a000-000000000001'
\set SHOP_2 '50000000-0000-4000-a000-000000000002'
\set SHOP_PEND '50000000-0000-4000-a000-000000000003'
\set ADDR_1 '60000000-0000-4000-a000-000000000001'
\set ORD_1 '70000000-0000-4000-a000-000000000001'
\set ORD_2 '70000000-0000-4000-a000-000000000002'
\set DEL_1 '80000000-0000-4000-a000-000000000001'
\set DEL_UNASSIGNED '80000000-0000-4000-a000-000000000002'
\set DP_1 '81000000-0000-4000-a000-000000000001'
\set DP_2 '81000000-0000-4000-a000-000000000002'
\set CAT_1 '90000000-0000-4000-a000-000000000001'
\set PROD_1 '91000000-0000-4000-a000-000000000001'
\set PROD_2 '91000000-0000-4000-a000-000000000002'
\set PROD_3 '91000000-0000-4000-a000-000000000003'

-- Provision auth.users rows if auth.users exists
insert into auth.users (id, email, phone) values
  (:'CUST_1', 'cust1@example.com', '+919111111111'),
  (:'CUST_2', 'cust2@example.com', '+919111111112'),
  (:'USER_OTHER', 'other@example.com', '+919111111199'),
  (:'OWNER_1', 'shop_919222222221@zuno.in', '+919222222221'),
  (:'OWNER_2', 'shop_919222222222@zuno.in', '+919222222222'),
  (:'OWNER_NEW', 'shop_919888888881@zuno.in', '+919888888881'),
  (:'RIDER_1', 'rider1@example.com', '+919333333331'),
  (:'RIDER_2', 'rider2@example.com', '+919333333332'),
  (:'ADMIN_1', 'admin@example.com', '+919444444441')
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, phone) values
  (:'CUST_1', 'CUSTOMER', 'Customer One', '+919111111111'),
  (:'CUST_2', 'CUSTOMER', 'Customer Two', '+919111111112'),
  (:'USER_OTHER', 'CUSTOMER', 'Unrelated User', '+919111111199'),
  (:'OWNER_1', 'SHOPKEEPER', 'Owner One', '+919222222221'),
  (:'OWNER_2', 'SHOPKEEPER', 'Owner Two', '+919222222222'),
  (:'RIDER_1', 'DELIVERY', 'Rider One', '+919333333331'),
  (:'RIDER_2', 'DELIVERY', 'Rider Two', '+919333333332'),
  (:'ADMIN_1', 'SUPER_ADMIN', 'Super Admin', '+919444444441')
on conflict (id) do nothing;

insert into public.shops (id, owner_id, name, phone, is_approved, approval_status, is_active, lat, lng) values
  (:'SHOP_1', :'OWNER_1', 'Shop One', '+919222222221', true, 'APPROVED', true, 24.21, 83.03),
  (:'SHOP_2', :'OWNER_2', 'Shop Two', '+919222222222', true, 'APPROVED', true, 24.21, 83.03),
  (:'SHOP_PEND', :'OWNER_2', 'Pending Shop', '+919222222229', false, 'PENDING', true, 24.21, 83.03)
on conflict (id) do nothing;

-- Verify Migration 014 safe defaults immediately on inserted shops, then set
-- fixture shops to a dynamic [IST - 1h, IST + 1h] schedule so P0/Phase 1/2
-- order tests execute reliably at any wall-clock time.
do $$
declare
  v_default_hours jsonb;
  v_delivery boolean;
  v_open_str text;
  v_close_str text;
  v_dyn_hours jsonb;
begin
  select opening_hours, is_delivery_available
  into v_default_hours, v_delivery
  from public.shops where id = '50000000-0000-4000-a000-000000000001';

  if v_default_hours <> public.default_shop_opening_hours() or v_delivery is not true then
    raise exception 'Phase 3 FAIL: Existing/new shops must receive default 08:00-21:00 opening_hours and is_delivery_available=true';
  end if;

  v_open_str := to_char((now() at time zone 'Asia/Kolkata') - interval '1 hour', 'HH24:MI');
  v_close_str := to_char((now() at time zone 'Asia/Kolkata') + interval '1 hour', 'HH24:MI');

  select jsonb_object_agg(
    d,
    jsonb_build_object('enabled', true, 'open', v_open_str, 'close', v_close_str)
  ) into v_dyn_hours
  from unnest(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday']) as d;

  update public.shops
  set opening_hours = v_dyn_hours
  where id in ('50000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000002');
end;
$$;

insert into public.addresses (id, user_id, label, line1, pincode, lat, lng) values
  (:'ADDR_1', :'CUST_1', 'Home', 'Sector 2 Renukoot', '231217', 24.21, 83.03)
on conflict (id) do nothing;

insert into public.categories (id, name, slug) values
  (:'CAT_1', 'Grocery Test', 'grocery-p0-test')
on conflict (id) do nothing;

insert into public.products (id, category_id, name, unit) values
  (:'PROD_1', :'CAT_1', 'Atta 5kg', 'pack'),
  (:'PROD_2', :'CAT_1', 'Dal 1kg', 'kg'),
  (:'PROD_3', :'CAT_1', 'Oil 1L', 'litre')
on conflict (id) do nothing;

insert into public.shop_products (shop_id, product_id, price, stock, available) values
  (:'SHOP_1', :'PROD_1', 220, 10, true),
  (:'SHOP_1', :'PROD_2', 110, 5, false),
  (:'SHOP_1', :'PROD_3', 140, 0, false),
  (:'SHOP_2', :'PROD_2', 115, 0, false)
on conflict (shop_id, product_id) do nothing;

insert into public.delivery_partners (id, user_id, full_name, phone, is_available, approval_status) values
  (:'DP_1', :'RIDER_1', 'Rider One', '+919333333331', true, 'APPROVED'),
  (:'DP_2', :'RIDER_2', 'Rider Two', '+919333333332', true, 'APPROVED')
on conflict (id) do nothing;

insert into public.orders (id, customer_id, shop_id, address_id, status, subtotal, delivery_fee, total) values
  (:'ORD_1', :'CUST_1', :'SHOP_1', :'ADDR_1', 'OUT_FOR_DELIVERY', 220, 20, 240),
  (:'ORD_2', :'CUST_2', :'SHOP_2', :'ADDR_1', 'READY_FOR_PICKUP', 115, 20, 135)
on conflict (id) do nothing;

insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, subtotal) values
  (:'ORD_1', :'PROD_1', 'Atta 5kg', 220, 1, 220)
on conflict do nothing;

insert into public.payments (order_id, method, status, amount, provider_reference) values
  (:'ORD_1', 'UPI', 'PAID', 240, 'SECRET_PROVIDER_TOKEN_XYZ')
on conflict do nothing;

insert into public.deliveries (id, order_id, delivery_partner_id, status, pickup_address, dropoff_address, payout) values
  (:'DEL_1', :'ORD_1', :'DP_1', 'ASSIGNED', 'Shop One, Renukoot', 'Sector 2 Renukoot - 231217', 40.00),
  (:'DEL_UNASSIGNED', :'ORD_2', null, 'UNASSIGNED', 'Shop Two, Renukoot', 'Sector 2 Renukoot - 231217', 40.00)
on conflict (id) do nothing;

do $$
declare
  v_cnt integer;
  v_caught boolean;
  v_res jsonb;
begin
  -- 1. Customer 1: positive own read, negative cross-customer, negative approval & registration role-escalation
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  select count(*) into v_cnt from public.orders;
  if v_cnt <> 1 then
    raise exception 'P0-A FAIL: Customer 1 expected 1 own order, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.deliveries;
  if v_cnt <> 1 then
    raise exception 'P0-A FAIL: Customer 1 expected 1 own delivery, got %', v_cnt;
  end if;

  v_caught := false;
  begin
    perform public.approve_or_reject_shop('50000000-0000-4000-a000-000000000003', 'APPROVED');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-B FAIL: Customer must be rejected from approve_or_reject_shop';
  end if;

  v_caught := false;
  begin
    perform public.register_shop_application('Cust Evil', '9111111111', 'Evil Shop');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-C FAIL: Customer must not convert profile to SHOPKEEPER';
  end if;

  select count(*) into v_cnt from public.shop_products;
  if v_cnt <> 1 then
    raise exception 'P0-D FAIL: Public/customer expected 1 available shop_product, got %', v_cnt;
  end if;

  -- 2. Unrelated authenticated user: zero orders, zero deliveries, zero private shops
  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000099', true);
  set local role authenticated;

  select count(*) into v_cnt from public.orders;
  if v_cnt <> 0 then
    raise exception 'P0-A FAIL: Unrelated user expected 0 orders, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.deliveries;
  if v_cnt <> 0 then
    raise exception 'P0-A FAIL: Unrelated user expected 0 deliveries, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.shops;
  if v_cnt <> 0 then
    raise exception 'P0-G FAIL: Ordinary user expected 0 direct public.shops rows, got %', v_cnt;
  end if;

  -- 3. Shopkeeper Owner 1: own orders, own all-state products, own context, denied cross-shop & approval
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  select count(*) into v_cnt from public.orders;
  if v_cnt <> 1 then
    raise exception 'P0-A FAIL: Shopkeeper 1 expected 1 own shop order, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.shop_products;
  if v_cnt <> 3 then
    raise exception 'P0-D FAIL: Shopkeeper 1 expected all 3 own products, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.get_shop_order_fulfillment_context('50000000-0000-4000-a000-000000000001');
  if v_cnt <> 1 then
    raise exception 'P0-F FAIL: Shopkeeper 1 expected 1 fulfillment context row, got %', v_cnt;
  end if;

  v_caught := false;
  begin
    perform * from public.get_shop_order_fulfillment_context('50000000-0000-4000-a000-000000000002');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-F FAIL: Cross-shop fulfillment context must be rejected';
  end if;

  v_caught := false;
  begin
    perform public.approve_or_reject_shop('50000000-0000-4000-a000-000000000003', 'APPROVED');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-B FAIL: Shopkeeper must not approve another shop';
  end if;

  -- Trigger protection check against direct UPDATE on shops.is_approved
  v_caught := false;
  begin
    update public.shops set is_approved = false where id = '50000000-0000-4000-a000-000000000001';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-B FAIL: trigger_shops_approval_protection must block non-admin approval mutation';
  end if;

  -- Mismatched phone registration check
  v_caught := false;
  begin
    perform public.register_shop_application('Spoof Name', '9888888881', 'Spoof Shop');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-C FAIL: User must not register another phone number';
  end if;

  -- 4. Assigned Rider 1 vs Unassigned Rider 2
  reset role;
  perform set_config('request.jwt.claim.sub', '30000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  select count(*) into v_cnt from public.orders;
  if v_cnt <> 1 then
    raise exception 'P0-A FAIL: Assigned Rider 1 expected 1 assigned order, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.shops where id = '50000000-0000-4000-a000-000000000001';
  if v_cnt <> 1 then
    raise exception 'Delivery FAIL: Assigned Rider 1 must read pickup shop for assigned delivery';
  end if;

  select count(*) into v_cnt from public.shops where id = '50000000-0000-4000-a000-000000000002';
  if v_cnt <> 0 then
    raise exception 'Delivery FAIL: Rider 1 must NOT read Shop Two for UNASSIGNED delivery';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', '30000000-0000-4000-a000-000000000002', true);
  set local role authenticated;

  select count(*) into v_cnt from public.orders;
  if v_cnt <> 0 then
    raise exception 'P0-A FAIL: Unassigned Rider 2 expected 0 orders, got %', v_cnt;
  end if;

  select count(*) into v_cnt from public.deliveries where status = 'UNASSIGNED';
  if v_cnt <> 1 then
    raise exception 'Delivery FAIL: Approved Rider 2 must discover 1 UNASSIGNED delivery';
  end if;

  -- 5. Legitimate self-matched shopkeeper registration creates PENDING shop
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000003', true);
  set local role authenticated;

  v_res := public.register_shop_application('New Merchant', '9888888881', 'New Kirana');
  if (v_res->>'approval_status') <> 'PENDING' then
    raise exception 'P0-C FAIL: New registration must stay PENDING';
  end if;

  -- 6. Anonymous caller: blocked from approve_or_reject_shop, register_shop_application, public.shops; allowed on public_storefronts
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;

  v_caught := false;
  begin
    perform public.approve_or_reject_shop('50000000-0000-4000-a000-000000000003', 'APPROVED');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-B FAIL: anon must not execute approve_or_reject_shop';
  end if;

  v_caught := false;
  begin
    perform public.register_shop_application('Anon Owner', '9777777771', 'Anon Shop');
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-C FAIL: anon must not execute register_shop_application';
  end if;

  v_caught := false;
  begin
    select count(*) into v_cnt from public.shops;
  exception when insufficient_privilege then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'P0-G FAIL: anon must be denied direct SELECT on public.shops';
  end if;

  select count(*) into v_cnt from public.public_storefronts;
  if v_cnt <> 2 then
    raise exception 'P0-G FAIL: public_storefronts expected 2 approved active shops, got %', v_cnt;
  end if;

  -- 7. Super Admin: invalid status returns false, valid APPROVED/REJECTED/SUSPENDED works
  reset role;
  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  v_res := public.approve_or_reject_shop('50000000-0000-4000-a000-000000000003', 'INVALID_STATUS');
  if (v_res->>'success')::boolean then
    raise exception 'P0-B FAIL: Invalid status must be rejected';
  end if;

  v_res := public.approve_or_reject_shop('50000000-0000-4000-a000-000000000003', 'APPROVED');
  if not (v_res->>'success')::boolean then
    raise exception 'P0-B FAIL: Admin approval must succeed';
  end if;

  -- 8. Order Lifecycle & Delivery Transition Protections (enforce_order_integrity_and_delivery)
  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  insert into public.orders (id, customer_id, shop_id, address_id, status, subtotal, delivery_fee, total)
  values ('70000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000001', '60000000-0000-4000-a000-000000000001', 'PLACED', 150, 20, 170);

  -- Shopkeeper Owner 1 acts on ORD_3
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  -- 8a. Cannot skip state machine PLACED -> DELIVERED
  v_caught := false;
  begin
    update public.orders set status = 'DELIVERED' where id = '70000000-0000-4000-a000-000000000003';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Lifecycle FAIL: Shopkeeper must not jump PLACED -> DELIVERED';
  end if;

  -- 8b. Cannot tamper with order financial fields (total = 1)
  v_caught := false;
  begin
    update public.orders set total = 1 where id = '70000000-0000-4000-a000-000000000003';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Lifecycle FAIL: Shopkeeper must not alter immutable order total';
  end if;

  -- 8c. Valid transitions PLACED -> ACCEPTED -> PREPARING -> READY_FOR_PICKUP auto-creates UNASSIGNED delivery
  update public.orders set status = 'ACCEPTED' where id = '70000000-0000-4000-a000-000000000003';
  update public.orders set status = 'PREPARING' where id = '70000000-0000-4000-a000-000000000003';
  update public.orders set status = 'READY_FOR_PICKUP' where id = '70000000-0000-4000-a000-000000000003';

  -- Customer cannot cancel once ACCEPTED/READY_FOR_PICKUP
  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  update public.orders set status = 'CANCELLED' where id = '70000000-0000-4000-a000-000000000003';
  -- Note: orders_update_customer RLS restricts customer update strictly to status = 'PLACED', so 0 rows updated
  reset role;
  select count(*) into v_cnt from public.orders where id = '70000000-0000-4000-a000-000000000003' and status = 'READY_FOR_PICKUP';
  if v_cnt <> 1 then
    raise exception 'Lifecycle FAIL: Customer must not cancel READY_FOR_PICKUP order';
  end if;

  -- Verify automatic UNASSIGNED delivery created & claim_delivery_assignment works for approved Rider 2
  select count(*) into v_cnt from public.deliveries where order_id = '70000000-0000-4000-a000-000000000003' and status = 'UNASSIGNED';
  if v_cnt <> 1 then
    raise exception 'Lifecycle FAIL: Transition to READY_FOR_PICKUP must create 1 UNASSIGNED delivery';
  end if;

  perform set_config('request.jwt.claim.sub', '30000000-0000-4000-a000-000000000002', true);
  set local role authenticated;
  select public.claim_delivery_assignment(d.id)
  into v_res
  from public.deliveries d
  where d.order_id = '70000000-0000-4000-a000-000000000003';
  if not (v_res->>'success')::boolean then
    raise exception 'Lifecycle FAIL: Approved Rider 2 claim_delivery_assignment failed: %', v_res;
  end if;

  -- Assigned Rider 2 can now read the assigned order & shop and confirm pickup + delivery
  select count(*) into v_cnt from public.orders where id = '70000000-0000-4000-a000-000000000003';
  if v_cnt <> 1 then
    raise exception 'Lifecycle FAIL: Assigned Rider 2 must see order after claiming assignment';
  end if;
  select count(*) into v_cnt from public.shops where id = '50000000-0000-4000-a000-000000000001';
  if v_cnt <> 1 then
    raise exception 'Lifecycle FAIL: Assigned Rider 2 must see pickup shop details after claiming assignment';
  end if;

  update public.deliveries
  set status = 'OUT_FOR_DELIVERY', picked_up_at = now()
  where order_id = '70000000-0000-4000-a000-000000000003';
  update public.orders
  set status = 'OUT_FOR_DELIVERY'
  where id = '70000000-0000-4000-a000-000000000003';

  update public.deliveries
  set status = 'COMPLETED', delivered_at = now()
  where order_id = '70000000-0000-4000-a000-000000000003';
  update public.orders
  set status = 'DELIVERED'
  where id = '70000000-0000-4000-a000-000000000003';

  select count(*) into v_cnt
  from public.orders o
  join public.deliveries d on d.order_id = o.id
  where o.id = '70000000-0000-4000-a000-000000000003'
    and o.status = 'DELIVERED'
    and d.status = 'COMPLETED';
  if v_cnt <> 1 then
    raise exception 'Lifecycle FAIL: Assigned Rider pickup/delivery confirmation failed';
  end if;

  -- Customer 1 resolves delivered order history & shop name from public_storefronts
  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  select count(*) into v_cnt
  from public.orders o
  join public.public_storefronts ps on ps.id = o.shop_id
  where o.id = '70000000-0000-4000-a000-000000000003'
    and ps.name = 'Shop One';
  if v_cnt <> 1 then
    raise exception 'Cross-App FAIL: Customer must resolve delivered order shop name via public_storefronts';
  end if;

  -- Super Admin sees platform orders, shops, and deliveries cleanly
  reset role;
  perform set_config('request.jwt.claim.sub', '40000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  select count(*) into v_cnt
  from public.orders o
  join public.shops s on s.id = o.shop_id
  join public.deliveries d on d.order_id = o.id
  where o.id = '70000000-0000-4000-a000-000000000003';
  if v_cnt <> 1 then
    raise exception 'Cross-App FAIL: Super Admin must read cross-app orders/shops/deliveries';
  end if;

  -- 9. Phase 2: Product Request RLS Isolation & Safe Storefront Listing Removal
  reset role;
  insert into public.product_requests (shop_id, requested_by, category_id, product_name, unit, status, rejection_reason)
  values
    ('50000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '90000000-0000-4000-a000-000000000001', 'Req Honey 250g', 'g', 'PENDING', null),
    ('50000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '90000000-0000-4000-a000-000000000001', 'Req Old Spice', 'g', 'REJECTED', 'Duplicate catalog entry'),
    ('50000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000002', '90000000-0000-4000-a000-000000000001', 'Shop2 Only Req', 'kg', 'APPROVED', null);

  -- Owner 1 sees only own 2 requests
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  select count(*) into v_cnt from public.product_requests;
  if v_cnt <> 2 then
    raise exception 'Phase 2 FAIL: Owner 1 expected 2 own product_requests, got %', v_cnt;
  end if;

  -- Owner 2 cannot see Owner 1 requests and cannot delete Owner 1 shop_products
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000002', true);
  set local role authenticated;
  select count(*) into v_cnt from public.product_requests;
  if v_cnt <> 1 then
    raise exception 'Phase 2 FAIL: Owner 2 expected 1 own product_request, got %', v_cnt;
  end if;

  delete from public.shop_products
  where shop_id = '50000000-0000-4000-a000-000000000001'
    and product_id = '91000000-0000-4000-a000-000000000001';

  reset role;
  select count(*) into v_cnt
  from public.shop_products
  where shop_id = '50000000-0000-4000-a000-000000000001'
    and product_id = '91000000-0000-4000-a000-000000000001';
  if v_cnt <> 1 then
    raise exception 'Phase 2 FAIL: Cross-shop DELETE must not remove Shop 1 listing';
  end if;

  -- Owner 1 removes unreferenced Shop 1 listing (PROD_1); global product & historical order_items stay intact
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  delete from public.shop_products
  where shop_id = '50000000-0000-4000-a000-000000000001'
    and product_id = '91000000-0000-4000-a000-000000000001';

  reset role;
  select count(*) into v_cnt
  from public.shop_products
  where shop_id = '50000000-0000-4000-a000-000000000001'
    and product_id = '91000000-0000-4000-a000-000000000001';
  if v_cnt <> 0 then
    raise exception 'Phase 2 FAIL: Owner 1 listing removal failed';
  end if;

  select count(*) into v_cnt from public.products where id = '91000000-0000-4000-a000-000000000001';
  if v_cnt <> 1 then
    raise exception 'Phase 2 FAIL: Global product must remain after removing shop listing';
  end if;

  select count(*) into v_cnt from public.order_items where order_id = '70000000-0000-4000-a000-000000000001';
  if v_cnt <> 1 then
    raise exception 'Phase 2 FAIL: Historical order_items must remain intact after removing shop listing';
  end if;

  -- Cart FK safety: active cart item prevents hard DELETE (23503), fallback zeroes stock cleanly
  insert into public.carts (id, customer_id, shop_id)
  values ('71000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000001');
  insert into public.cart_items (cart_id, shop_product_id, quantity)
  select '71000000-0000-4000-a000-000000000001', sp.id, 1
  from public.shop_products sp
  where sp.shop_id = '50000000-0000-4000-a000-000000000001'
    and sp.product_id = '91000000-0000-4000-a000-000000000002';

  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  v_caught := false;
  begin
    delete from public.shop_products
    where shop_id = '50000000-0000-4000-a000-000000000001'
      and product_id = '91000000-0000-4000-a000-000000000002';
  exception when foreign_key_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 2 FAIL: Active cart_items reference must raise SQLSTATE 23503 on hard delete';
  end if;

  select public.upsert_shop_product_and_inventory(
    '50000000-0000-4000-a000-000000000001',
    '91000000-0000-4000-a000-000000000002',
    110,
    0
  ) into v_res;
  if not (v_res->>'success')::boolean then
    raise exception 'Phase 2 FAIL: Atomic fallback unavailable update failed';
  end if;
end;
$$;

-- 10. Phase 3: Opening Hours, Delivery Availability, public_storefronts & Checkout Enforcement
do $$
declare
  v_caught boolean;
  v_cnt integer;
  v_open boolean;
  v_cols text[];
  v_closed_schedule jsonb := '{
    "monday": {"enabled": false, "open": null, "close": null},
    "tuesday": {"enabled": false, "open": null, "close": null},
    "wednesday": {"enabled": false, "open": null, "close": null},
    "thursday": {"enabled": false, "open": null, "close": null},
    "friday": {"enabled": false, "open": null, "close": null},
    "saturday": {"enabled": false, "open": null, "close": null},
    "sunday": {"enabled": false, "open": null, "close": null}
  }'::jsonb;
  v_overnight_schedule jsonb := '{
    "monday": {"enabled": true, "open": "20:00", "close": "02:00"},
    "tuesday": {"enabled": true, "open": "08:00", "close": "21:00"},
    "wednesday": {"enabled": true, "open": "08:00", "close": "00:00"},
    "thursday": {"enabled": false, "open": null, "close": null},
    "friday": {"enabled": true, "open": "08:00", "close": "21:00"},
    "saturday": {"enabled": true, "open": "08:00", "close": "21:00"},
    "sunday": {"enabled": true, "open": "08:00", "close": "21:00"}
  }'::jsonb;
  v_delivery_flag boolean;
  v_active_flag boolean;
  v_hours_back jsonb;
  v_sp1_id uuid;
  v_order_res jsonb;
  v_created_ord_id uuid;
begin
  reset role;

  -- 10a. Validate public_storefronts exposes opening_hours & is_delivery_available and excludes PII
  select array_agg(column_name::text order by ordinal_position)
  into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'public_storefronts';

  if not ('opening_hours' = any(v_cols)) or not ('is_delivery_available' = any(v_cols)) then
    raise exception 'Phase 3 FAIL: public_storefronts must expose opening_hours and is_delivery_available';
  end if;

  if ('owner_id' = any(v_cols)) or ('phone' = any(v_cols)) or ('address_line' = any(v_cols))
     or ('approval_status' = any(v_cols)) or ('is_approved' = any(v_cols)) then
    raise exception 'Phase 3 FAIL: public_storefronts leaked private shops columns: %', v_cols;
  end if;

  -- 10b. Verify Asia/Kolkata evaluation + midnight overnight boundary + closed day + corrupt fallback
  -- Monday 2026-11-09 22:30 IST (+05:30) => open under Monday 20:00-02:00
  v_open := public.is_shop_open_now(v_overnight_schedule, timestamptz '2026-11-09 22:30:00+05:30');
  if not v_open then
    raise exception 'Phase 3 FAIL: Overnight Monday 20:00-02:00 must be open at 22:30 IST';
  end if;

  -- Tuesday 2026-11-10 01:30 IST => open via Monday overnight carry-over!
  v_open := public.is_shop_open_now(v_overnight_schedule, timestamptz '2026-11-10 01:30:00+05:30');
  if not v_open then
    raise exception 'Phase 3 FAIL: Tuesday 01:30 IST must remain open under Monday 20:00-02:00 overnight boundary';
  end if;

  -- Tuesday 2026-11-10 02:30 IST => closed before 08:00
  v_open := public.is_shop_open_now(v_overnight_schedule, timestamptz '2026-11-10 02:30:00+05:30');
  if v_open then
    raise exception 'Phase 3 FAIL: Tuesday 02:30 IST must be closed';
  end if;

  -- Thursday (closed day) after Wednesday 08:00-00:00 close at 00:00
  v_open := public.is_shop_open_now(v_overnight_schedule, timestamptz '2026-11-12 00:00:00+05:30');
  if v_open then
    raise exception 'Phase 3 FAIL: Thursday 00:00 IST must be closed after Wednesday 08:00-00:00';
  end if;

  -- Null legacy fallback returns true; corrupt JSON fails closed
  if not public.is_shop_open_now(null, now()) then
    raise exception 'Phase 3 FAIL: Null opening_hours fallback must permit active legacy row';
  end if;
  if public.is_shop_open_now('{"monday": {"enabled": true}}'::jsonb, now()) then
    raise exception 'Phase 3 FAIL: Corrupt schedule must fail closed';
  end if;

  -- 10c. Reject invalid opening_hours via shops CHECK constraint (25:00 & identical open/close)
  v_caught := false;
  begin
    update public.shops
    set opening_hours = jsonb_set(v_overnight_schedule, '{monday,open}', '"25:00"'::jsonb)
    where id = '50000000-0000-4000-a000-000000000001';
  exception when check_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 3 FAIL: Check constraint must reject invalid hour 25:00';
  end if;

  v_caught := false;
  begin
    update public.shops
    set opening_hours = jsonb_set(v_overnight_schedule, '{monday}', '{"enabled":true,"open":"09:00","close":"09:00"}'::jsonb)
    where id = '50000000-0000-4000-a000-000000000001';
  exception when check_violation then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 3 FAIL: Check constraint must reject equal open & close times';
  end if;

  -- 10d. Owner 2 CANNOT mutate Shop 1 opening_hours or delivery toggle (multi-tenant RLS)
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000002', true);
  set local role authenticated;

  update public.shops
  set is_delivery_available = false
  where id = '50000000-0000-4000-a000-000000000001';
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then
    raise exception 'Phase 3 FAIL: Owner 2 updated Shop 1 delivery availability (% rows)', v_cnt;
  end if;

  -- 10e. Owner 1 CAN pause delivery without mutating is_active, and shop stays in public_storefronts
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  update public.shops
  set is_delivery_available = false
  where id = '50000000-0000-4000-a000-000000000001';

  select is_active, is_delivery_available
  into v_active_flag, v_delivery_flag
  from public.shops
  where id = '50000000-0000-4000-a000-000000000001';

  if not v_active_flag or v_delivery_flag then
    raise exception 'Phase 3 FAIL: Pausing delivery must keep is_active=true';
  end if;

  -- Verify anon sees paused shop in public_storefronts (still browsable) and still blocked from public.shops
  reset role;
  set local role anon;
  select count(*) into v_cnt
  from public.public_storefronts
  where id = '50000000-0000-4000-a000-000000000001'
    and is_active = true
    and is_delivery_available = false;
  if v_cnt <> 1 then
    raise exception 'Phase 3 FAIL: Delivery-paused active shop must remain visible in public_storefronts';
  end if;

  -- 10f. Checkout / Order Creation Server Enforcement (Customer role via trusted RPC)
  reset role;
  perform public.upsert_shop_product_and_inventory(
    '50000000-0000-4000-a000-000000000001',
    '91000000-0000-4000-a000-000000000001',
    220,
    10
  );
  select id into v_sp1_id from public.shop_products
  where shop_id = '50000000-0000-4000-a000-000000000001'
    and product_id = '91000000-0000-4000-a000-000000000001';
  if v_sp1_id is null then
    raise exception 'Phase 3 test setup FAIL: v_sp1_id missing';
  end if;

  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  v_caught := false;
  begin
    select public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp1_id, 'quantity', 1)),
      'p3-paused-check'
    ) into v_order_res;
  exception when raise_exception then
    if sqlerrm ilike '%temporarily paused%' then
      v_caught := true;
    end if;
  end;
  if not v_caught then
    raise exception 'Phase 3 Checkout FAIL: Order must be rejected specifically for paused delivery';
  end if;

  -- Existing historical order ORD_1 remains readable & unaffected
  select count(*) into v_cnt
  from public.orders
  where id = '70000000-0000-4000-a000-000000000001';
  if v_cnt <> 1 then
    raise exception 'Phase 3 FAIL: Existing placed order must remain unaffected';
  end if;

  -- (ii) Resume delivery, set closed schedule => order rejected!
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  select opening_hours into v_hours_back
  from public.shops where id = '50000000-0000-4000-a000-000000000001';

  update public.shops
  set is_delivery_available = true,
      opening_hours = v_closed_schedule
  where id = '50000000-0000-4000-a000-000000000001';

  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  v_caught := false;
  begin
    select public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp1_id, 'quantity', 1)),
      'p3-closed-check'
    ) into v_order_res;
  exception when raise_exception then
    if sqlerrm ilike '%currently closed%' then
      v_caught := true;
    end if;
  end;
  if not v_caught then
    raise exception 'Phase 3 Checkout FAIL: Order must be rejected when shop schedule is closed';
  end if;

  -- (iii) Open schedule + delivery available + offline (is_active = false) => order rejected!
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  update public.shops
  set opening_hours = v_hours_back,
      is_delivery_available = true,
      is_active = false
  where id = '50000000-0000-4000-a000-000000000001';

  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  v_caught := false;
  begin
    select public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp1_id, 'quantity', 1)),
      'p3-offline-check'
    ) into v_order_res;
  exception when raise_exception then
    if sqlerrm ilike '%currently offline%' then
      v_caught := true;
    end if;
  end;
  if not v_caught then
    raise exception 'Phase 3 Checkout FAIL: Order must be rejected when shop is offline (is_active=false)';
  end if;

  -- (iv) Shop online + open + delivery available => Customer order succeeds!
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  update public.shops
  set is_active = true,
      is_delivery_available = true
  where id = '50000000-0000-4000-a000-000000000001';

  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  select public.create_customer_order(
    '50000000-0000-4000-a000-000000000001',
    '60000000-0000-4000-a000-000000000001',
    jsonb_build_array(jsonb_build_object('shop_product_id', v_sp1_id, 'quantity', 1)),
    'p3-open-check'
  ) into v_order_res;
  v_created_ord_id := (v_order_res->>'order_id')::uuid;

  -- Existing historical order remains transitionable regardless of subsequent close/pause
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  update public.shops set is_delivery_available = false, is_active = false where id = '50000000-0000-4000-a000-000000000001';
  update public.orders set status = 'ACCEPTED' where id = v_created_ord_id;

  -- Restore Shop 1 open/active/delivery and stock for Section 11
  update public.shops set is_active = true, is_delivery_available = true where id = '50000000-0000-4000-a000-000000000001';
  reset role;
  perform public.upsert_shop_product_and_inventory('50000000-0000-4000-a000-000000000001', '91000000-0000-4000-a000-000000000001', 220, 10);
end;
$$;

-- 11. Phase 5: Secure Order RPC, Raw INSERT Denial, Stock Atomicity, Idempotency & Co-Owner RLS
do $$
declare
  v_caught boolean;
  v_sp_s1_p1 uuid;
  v_sp_s1_p2 uuid;
  v_sp_s2_p2 uuid;
  v_res1 jsonb;
  v_res2 jsonb;
  v_ord_id uuid;
  v_stock_after integer;
  v_inv_after integer;
  v_cnt integer;
  v_co_owner uuid := '20000000-0000-4000-a000-000000000003'; -- OWNER_NEW (already in auth.users/profiles!)
  v_staff uuid := '10000000-0000-4000-a000-000000000099'; -- USER_OTHER
begin
  reset role;

  -- Ensure Shop 1 has 2 products with synced inventory & Shop 2 has an active product
  update public.shop_products set price = 220, stock = 10, available = true
  where shop_id = '50000000-0000-4000-a000-000000000001' and product_id = '91000000-0000-4000-a000-000000000001'
  returning id into v_sp_s1_p1;
  insert into public.inventory (shop_product_id, quantity) values (v_sp_s1_p1, 10)
  on conflict do nothing;
  update public.inventory set quantity = 10 where shop_product_id = v_sp_s1_p1;

  update public.shop_products set price = 150, stock = 2, available = true
  where shop_id = '50000000-0000-4000-a000-000000000001' and product_id = '91000000-0000-4000-a000-000000000002'
  returning id into v_sp_s1_p2;
  update public.inventory set quantity = 2 where shop_product_id = v_sp_s1_p2;

  update public.shop_products set price = 115, stock = 5, available = true
  where shop_id = '50000000-0000-4000-a000-000000000002' and product_id = '91000000-0000-4000-a000-000000000002'
  returning id into v_sp_s2_p2;

  -- Add another customer address owned by CUST_2 (unowned by CUST_1)
  insert into public.addresses (id, user_id, label, line1, pincode, lat, lng)
  values ('60000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000002', 'Work', 'Other Road', '231217', 24.21, 83.03)
  on conflict (id) do nothing;

  -- Add shop_members: OWNER_NEW as OWNER of Shop 1, USER_OTHER as STAFF of Shop 1
  insert into public.shop_members (shop_id, user_id, role) values
    ('50000000-0000-4000-a000-000000000001', v_co_owner, 'OWNER'),
    ('50000000-0000-4000-a000-000000000001', v_staff, 'STAFF')
  on conflict (shop_id, user_id) do nothing;

  -- 11a. Attack 1-5: Raw INSERT into orders & order_items as authenticated CUSTOMER must FAIL
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  v_caught := false;
  begin
    insert into public.orders (customer_id, shop_id, address_id, status, subtotal, delivery_fee, total)
    values ('10000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000001', '60000000-0000-4000-a000-000000000001', 'DELIVERED', 0.01, 0, 0.01);
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Customer raw INSERT on orders must be denied';
  end if;

  v_caught := false;
  begin
    insert into public.order_items (order_id, product_id, product_name_snapshot, unit_price_snapshot, quantity, subtotal)
    values ('70000000-0000-4000-a000-000000000001', '91000000-0000-4000-a000-000000000001', 'Tampered', 0.01, 1, 0.01);
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Customer raw INSERT on order_items must be denied';
  end if;

  -- 11b. Attack 12: Unauthenticated / anon call to create_customer_order must FAIL
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  v_caught := false;
  begin
    perform public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 1)),
      'anon-attack'
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Anon call to create_customer_order must fail';
  end if;

  -- Non-CUSTOMER (Shopkeeper) cannot call create_customer_order
  reset role;
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  v_caught := false;
  begin
    perform public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 1)),
      'shop-role-attack'
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Non-CUSTOMER role must not call create_customer_order';
  end if;

  -- Switch to authenticated Customer 1
  reset role;
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  -- 11c. Attack 6: Another shop's product (Shop 2 item in Shop 1 order) => MUST FAIL
  v_caught := false;
  begin
    perform public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s2_p2, 'quantity', 1)),
      'cross-shop-item'
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Mixing another shop product must fail';
  end if;

  -- 11d. Attack 7: Another customer's address => MUST FAIL
  v_caught := false;
  begin
    perform public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000002',
      jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 1)),
      'stolen-address'
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Using another customer address must fail';
  end if;

  -- 11e. Attack 8 & 9: Negative & zero quantities + duplicate product IDs => MUST FAIL
  for v_res1 in
    select * from (values
      (jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 0))),
      (jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', -2))),
      (jsonb_build_array(
        jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 1),
        jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 1)
      ))
    ) as t(bad_items)
  loop
    v_caught := false;
    begin
      perform public.create_customer_order(
        '50000000-0000-4000-a000-000000000001',
        '60000000-0000-4000-a000-000000000001',
        v_res1,
        'bad-qty-dup'
      );
    exception when others then
      v_caught := true;
    end;
    if not v_caught then
      raise exception 'Phase 5 FAIL: Invalid qty/duplicate items must fail';
    end if;
  end loop;

  -- 11f. Attack 10 + Atomicity: Item 1 valid (qty 2 of 10), Item 2 exceeds stock (qty 5 of 2) => full rollback!
  v_caught := false;
  begin
    perform public.create_customer_order(
      '50000000-0000-4000-a000-000000000001',
      '60000000-0000-4000-a000-000000000001',
      jsonb_build_array(
        jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 2),
        jsonb_build_object('shop_product_id', v_sp_s1_p2, 'quantity', 5)
      ),
      'rollback-test'
    );
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Insufficient stock on item 2 must roll back whole order';
  end if;

  reset role;
  select stock into v_stock_after from public.shop_products where id = v_sp_s1_p1;
  if v_stock_after <> 10 then
    raise exception 'Phase 5 FAIL: Rollback must leave item 1 stock untouched (got %)', v_stock_after;
  end if;

  -- 11g. Valid order + Server-derived price/fee + Stock decrement + Idempotency replay
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;

  -- 2 * 220 = 440 (< 500 -> delivery_fee = 20, total = 460)
  select public.create_customer_order(
    '50000000-0000-4000-a000-000000000001',
    '60000000-0000-4000-a000-000000000001',
    jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 2)),
    'idem-key-unique-001'
  ) into v_res1;

  v_ord_id := (v_res1->>'order_id')::uuid;
  if (v_res1->>'status') <> 'PLACED'
     or (v_res1->>'subtotal')::numeric <> 440
     or (v_res1->>'delivery_fee')::numeric <> 20
     or (v_res1->>'total')::numeric <> 460
     or (v_res1->>'idempotent_replay')::boolean then
    raise exception 'Phase 5 FAIL: Server order computation mismatch: %', v_res1;
  end if;

  -- Replay same idempotency_key => same order_id, idempotent_replay = true, stock NOT decremented again
  select public.create_customer_order(
    '50000000-0000-4000-a000-000000000001',
    '60000000-0000-4000-a000-000000000001',
    jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 2)),
    'idem-key-unique-001'
  ) into v_res2;

  if (v_res2->>'order_id')::uuid <> v_ord_id or not (v_res2->>'idempotent_replay')::boolean then
    raise exception 'Phase 5 FAIL: Idempotency replay failed: %', v_res2;
  end if;

  reset role;
  select sp.stock, i.quantity into v_stock_after, v_inv_after
  from public.shop_products sp
  join public.inventory i on i.shop_product_id = sp.id
  where sp.id = v_sp_s1_p1;
  if v_stock_after <> 8 or v_inv_after <> 8 then
    raise exception 'Phase 5 FAIL: Stock must decrement once from 10 to 8, got sp=% inv=%', v_stock_after, v_inv_after;
  end if;

  -- 11h. Free delivery threshold >= 500 (3 * 220 = 660 -> delivery_fee = 0, total = 660)
  perform set_config('request.jwt.claim.sub', '10000000-0000-4000-a000-000000000001', true);
  set local role authenticated;
  select public.create_customer_order(
    '50000000-0000-4000-a000-000000000001',
    '60000000-0000-4000-a000-000000000001',
    jsonb_build_array(jsonb_build_object('shop_product_id', v_sp_s1_p1, 'quantity', 3)),
    'idem-key-free-del-002'
  ) into v_res1;
  if (v_res1->>'delivery_fee')::numeric <> 0 or (v_res1->>'total')::numeric <> 660 then
    raise exception 'Phase 5 FAIL: Subtotal >= 500 must yield free delivery (got %)', v_res1;
  end if;

  -- 11i. Co-owner (shop_members role='OWNER') CAN update Shop 1 delivery availability; STAFF cannot
  reset role;
  perform set_config('request.jwt.claim.sub', v_co_owner::text, true);
  set local role authenticated;
  update public.shops set is_delivery_available = false where id = '50000000-0000-4000-a000-000000000001';
  get diagnostics v_cnt = row_count;
  if v_cnt <> 1 then
    raise exception 'Phase 5 FAIL: Co-owner (OWNER) must be able to update shop operational fields';
  end if;

  -- Co-owner STILL blocked by trigger_shops_approval_protection from tampering owner_id/approval
  v_caught := false;
  begin
    update public.shops set is_approved = false where id = '50000000-0000-4000-a000-000000000001';
  exception when others then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'Phase 5 FAIL: Co-owner must still be blocked from altering approval status';
  end if;

  reset role;
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  set local role authenticated;
  update public.shops set is_delivery_available = true where id = '50000000-0000-4000-a000-000000000001';
  get diagnostics v_cnt = row_count;
  if v_cnt <> 0 then
    raise exception 'Phase 5 FAIL: STAFF member must NOT update shops row directly (% rows)', v_cnt;
  end if;
end;
$$;

rollback;
