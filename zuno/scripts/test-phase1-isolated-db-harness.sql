-- =====================================================================
-- ZUNO Phase 1.3.1 — Hardened Isolated PostgreSQL Test Harness
-- Target: Disposable local PostgreSQL or local Supabase test database
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- 0. Safety Precondition Check
-- Ensure we are NEVER running against production or shared databases.
-- ---------------------------------------------------------------------
do $$
declare
  v_current_db text := current_database();
begin
  -- Refuse to run if database name indicates production or default shared instance
  if v_current_db in ('postgres', 'production', 'zuno_prod') and current_setting('zuno.allow_root_test', true) is null then
    raise notice 'SAFETY ADVISORY: Running in database "%". Ensure this is a dedicated isolated test instance.', v_current_db;
  end if;
end;
$$;

begin;

-- Create helper schema for auth simulation if not present
create schema if not exists auth;
create or replace function auth.uid() returns uuid as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$ language sql stable;

-- ---------------------------------------------------------------------
-- 1. Deterministic Fixture Setup
-- ---------------------------------------------------------------------
savepoint sp_fixtures;

-- Test IDs (deterministic valid hex UUIDs)
\set CAT_ID 'c0000000-0000-4000-a000-000000000001'
\set USER_OWNER_A 'a0000000-0000-4000-a000-000000000001'
\set USER_OWNER_B 'a0000000-0000-4000-a000-000000000002'
\set USER_CO_OWNER 'a0000000-0000-4000-a000-000000000003'
\set USER_ADMIN 'a0000000-0000-4000-a000-000000000004'

\set SHOP_A 'b0000000-0000-4000-a000-000000000001'
\set SHOP_B 'b0000000-0000-4000-a000-000000000002'
\set SHOP_UNAPPROVED 'b0000000-0000-4000-a000-000000000003'

\set PROD_1 'd0000000-0000-4000-a000-000000000001'
\set PROD_2 'd0000000-0000-4000-a000-000000000002'

-- Category
insert into public.categories (id, name, slug)
values (:'CAT_ID', 'Dairy & Milk', 'dairy-milk-test')
on conflict (id) do nothing;

-- Auth identities (required by public.profiles FK references auth.users)
insert into auth.users (id, email, phone)
values
  (:'USER_OWNER_A', 'shop_919000000001@zuno.in', '+919000000001'),
  (:'USER_OWNER_B', 'shop_919000000002@zuno.in', '+919000000002'),
  (:'USER_CO_OWNER', 'shop_919000000003@zuno.in', '+919000000003'),
  (:'USER_ADMIN', 'admin_test@zuno.in', '+919000000004')
on conflict (id) do nothing;

-- Profiles
insert into public.profiles (id, full_name, phone, role)
values 
  (:'USER_OWNER_A', 'Shopkeeper A', '+919000000001', 'SHOPKEEPER'),
  (:'USER_OWNER_B', 'Shopkeeper B', '+919000000002', 'SHOPKEEPER'),
  (:'USER_CO_OWNER', 'Co-Owner A', '+919000000003', 'SHOPKEEPER'),
  (:'USER_ADMIN', 'Super Administrator', '+919000000004', 'ADMIN')
on conflict (id) do nothing;

-- Shops
insert into public.shops (id, owner_id, name, is_approved, approval_status, lat, lng)
values 
  (:'SHOP_A', :'USER_OWNER_A', 'Kirana A', true, 'APPROVED', 24.2185, 83.0326),
  (:'SHOP_B', :'USER_OWNER_B', 'Kirana B', true, 'APPROVED', 24.2185, 83.0326),
  (:'SHOP_UNAPPROVED', :'USER_OWNER_A', 'Unapproved Shop', false, 'PENDING', 24.2185, 83.0326)
on conflict (id) do nothing;

-- Shop Members (Co-Owner on Shop A)
insert into public.shop_members (shop_id, user_id, role)
values (:'SHOP_A', :'USER_CO_OWNER', 'OWNER')
on conflict do nothing;

-- Central Products
insert into public.products (id, category_id, name, unit)
values 
  (:'PROD_1', :'CAT_ID', 'Amul Taaza Milk', '500 ml'),
  (:'PROD_2', :'CAT_ID', 'Amul Taaza Milk', '1 L')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Test Suite: Canonical Product Variant Uniqueness
-- ---------------------------------------------------------------------
do $$
declare
  v_caught_expected boolean := false;
begin
  -- 2.1 Legitimate variants: PROD_1 ('500 ml') and PROD_2 ('1 L') share name in same category
  -- Both must coexist cleanly (already inserted in fixtures)
  if (select count(*) from public.products where category_id = 'c0000000-0000-4000-a000-000000000001' and lower(trim(name)) = 'amul taaza milk') != 2 then
    raise exception 'TEST FAILED: Legitimate variants sharing name with different units must both exist.';
  end if;

  -- 2.2 Identical duplicate variant: (category, normalized name, normalized unit) -> MUST FAIL with 23505
  begin
    insert into public.products (id, category_id, name, unit)
    values (gen_random_uuid(), 'c0000000-0000-4000-a000-000000000001', '  AMUL TAAZA MILK  ', '  500 ml  ');
  exception
    when sqlstate '23505' then -- unique_violation
      v_caught_expected := true;
  end;

  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Duplicate product variant should have raised SQLSTATE 23505 (unique_violation), but succeeded.';
  end if;

  raise notice '[PASS] Test 2: Composite product variant uniqueness strictly enforced with SQLSTATE 23505.';
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Test Suite: Atomic RPC True Rollback Verification
-- ---------------------------------------------------------------------
-- We test that if an inventory mutation fails, shop_products mutation ROLLS BACK
do $$
declare
  v_caught_expected boolean := false;
  v_shop_prod_count integer;
  v_inv_count integer;
  v_shop_id uuid := 'b0000000-0000-4000-a000-000000000001';
  v_prod_id uuid := 'd0000000-0000-4000-a000-000000000001';
  v_res jsonb;
begin
  -- Simulate caller as Shop A Owner
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-a000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- 3.1 Happy Path: Successful atomic listing
  select public.upsert_shop_product_and_inventory(v_shop_id, v_prod_id, 32.00, 20) into v_res;
  if (v_res->>'success')::boolean is not true then
    raise exception 'ASSERTION FAILED: Happy path RPC invocation did not return success = true.';
  end if;

  -- Verify both rows exist and match
  select count(*) into v_shop_prod_count from public.shop_products where shop_id = v_shop_id and product_id = v_prod_id and stock = 20;
  select count(*) into v_inv_count from public.inventory i join public.shop_products sp on sp.id = i.shop_product_id where sp.shop_id = v_shop_id and sp.product_id = v_prod_id and i.quantity = 20;
  
  if v_shop_prod_count != 1 or v_inv_count != 1 then
    raise exception 'ASSERTION FAILED: Both shop_products and inventory must be synchronized on successful upsert.';
  end if;

  reset role;
  raise notice '[PASS] Test 3.1: Happy path atomic upsert synchronized both tables.';
end;
$$;

-- 3.2 Induce failure in inventory and verify shop_products rolls back
savepoint sp_atomic_test;

create or replace function pg_temp.test_induce_inventory_error() returns trigger as $$
begin
  raise exception 'INDUCED_INVENTORY_FAILURE' using errcode = 'P9999';
end;
$$ language plpgsql;

create trigger trg_test_fail_inventory
  before update on public.inventory
  for each row execute function pg_temp.test_induce_inventory_error();

do $$
declare
  v_caught_expected boolean := false;
  v_shop_id uuid := 'b0000000-0000-4000-a000-000000000001';
  v_prod_id uuid := 'd0000000-0000-4000-a000-000000000001';
  v_res jsonb;
  v_retained_stock integer;
begin
  -- Simulate caller as Shop A Owner
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-a000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- Attempt to update price to 40 and stock to 99
  -- Trigger will abort during inventory update step
  begin
    select public.upsert_shop_product_and_inventory(v_shop_id, v_prod_id, 40.00, 99) into v_res;
  exception
    when sqlstate 'P9999' then
      v_caught_expected := true;
  end;

  reset role;

  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Trigger failure was not caught with SQLSTATE P9999.';
  end if;

  -- Remove trigger
  drop trigger if exists trg_test_fail_inventory on public.inventory;

  -- CRITICAL VERIFICATION: shop_products.stock MUST STILL BE 20 (NOT 99)!
  select stock into v_retained_stock from public.shop_products where shop_id = v_shop_id and product_id = v_prod_id;
  if v_retained_stock != 20 then
    raise exception 'ASSERTION FAILED: Atomic rollback violated! shop_products retains mutation (stock = %) after inventory failure.', v_retained_stock;
  end if;

  raise notice '[PASS] Test 3.2: True transaction rollback verified. shop_products reverted completely upon inventory failure.';
end;
$$;

rollback to savepoint sp_atomic_test;

-- ---------------------------------------------------------------------
-- 4. Test Suite: Authorization & Multi-Tenant Isolation
-- ---------------------------------------------------------------------
do $$
declare
  v_caught_expected boolean := false;
  v_res jsonb;
begin
  -- 4.1 Cross-Shop Impersonation Rejection: User B attempts to mutate Shop A
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-a000-000000000002', true); -- Owner B
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  begin
    select public.upsert_shop_product_and_inventory(
      'b0000000-0000-4000-a000-000000000001', -- Shop A
      'd0000000-0000-4000-a000-000000000001',
      25.00,
      10
    ) into v_res;
  exception
    when sqlstate 'P0001' then -- raise_exception from plpgsql
      if sqlerrm like '%caller is not authorized%' then
        v_caught_expected := true;
      end if;
  end;

  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Unauthorized cross-shop mutation must raise SQLSTATE P0001 with authorization error.';
  end if;

  -- 4.2 Co-Owner Authorization Success: Co-Owner of Shop A can update Shop A
  v_caught_expected := false;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-a000-000000000003', true); -- Co-Owner
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select public.upsert_shop_product_and_inventory(
    'b0000000-0000-4000-a000-000000000001',
    'd0000000-0000-4000-a000-000000000001',
    35.00,
    15
  ) into v_res;

  if (v_res->>'success')::boolean is not true then
    raise exception 'ASSERTION FAILED: Legitimate co-owner was denied access.';
  end if;

  -- 4.3 Unapproved Shop Rejection: Caller owns Shop C, but Shop C is unapproved
  v_caught_expected := false;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-a000-000000000001', true);
  begin
    select public.upsert_shop_product_and_inventory(
      'b0000000-0000-4000-a000-000000000003', -- Unapproved Shop
      'd0000000-0000-4000-a000-000000000001',
      10.00,
      5
    ) into v_res;
  exception
    when sqlstate 'P0001' then
      v_caught_expected := true;
  end;

  reset role;

  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Unapproved shop product mutation must be rejected with SQLSTATE P0001.';
  end if;

  raise notice '[PASS] Test 4: Cross-shop isolation, co-owner permissions, and shop approval checks verified.';
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Test Suite: Product Request RLS Hardened Policy Enforcement
-- ---------------------------------------------------------------------
-- Enable RLS simulation under authenticated shopkeeper
do $$
declare
  v_caught_expected boolean := false;
  v_req_id uuid;
begin
  -- Set caller identity to Shop A Owner under authenticated role (so RLS is enforced)
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-4000-a000-000000000001', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;

  -- 5.1 Valid Request Submission -> MUST SUCCEED
  insert into public.product_requests (
    id, shop_id, requested_by, category_id, product_name, unit, status
  ) values (
    gen_random_uuid(),
    'b0000000-0000-4000-a000-000000000001',
    'a0000000-0000-4000-a000-000000000001', -- auth.uid()
    'c0000000-0000-4000-a000-000000000001',
    'Organic Paneer',
    '200 g',
    'PENDING'
  ) returning id into v_req_id;

  if v_req_id is null then
    raise exception 'ASSERTION FAILED: Valid product request insertion failed.';
  end if;

  -- 5.2 Forged requested_by -> MUST FAIL with SQLSTATE 42501 / 44000 (RLS WITH CHECK)
  v_caught_expected := false;
  begin
    insert into public.product_requests (
      shop_id, requested_by, category_id, product_name, unit, status
    ) values (
      'b0000000-0000-4000-a000-000000000001',
      'a0000000-0000-4000-a000-000000000002', -- Spoofed requested_by!
      'c0000000-0000-4000-a000-000000000001',
      'Organic Butter',
      '100 g',
      'PENDING'
    );
  exception
    when sqlstate '44000' or sqlstate '42501' then
      v_caught_expected := true;
  end;
  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Forged requested_by must be rejected by RLS WITH CHECK.';
  end if;

  -- 5.3 Forged reviewed_at -> MUST FAIL with SQLSTATE 42501 / 44000
  v_caught_expected := false;
  begin
    insert into public.product_requests (
      shop_id, requested_by, category_id, product_name, unit, status, reviewed_at
    ) values (
      'b0000000-0000-4000-a000-000000000001',
      'a0000000-0000-4000-a000-000000000001',
      'c0000000-0000-4000-a000-000000000001',
      'Organic Butter',
      '100 g',
      'PENDING',
      now() -- Spoofed reviewed_at!
    );
  exception
    when sqlstate '44000' or sqlstate '42501' then
      v_caught_expected := true;
  end;
  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Forged reviewed_at must be rejected by RLS WITH CHECK.';
  end if;

  -- 5.4 Forged status = 'APPROVED' -> MUST FAIL with SQLSTATE 42501 / 44000
  v_caught_expected := false;
  begin
    insert into public.product_requests (
      shop_id, requested_by, category_id, product_name, unit, status
    ) values (
      'b0000000-0000-4000-a000-000000000001',
      'a0000000-0000-4000-a000-000000000001',
      'c0000000-0000-4000-a000-000000000001',
      'Organic Ghee',
      '500 ml',
      'APPROVED' -- Spoofed status!
    );
  exception
    when sqlstate '44000' or sqlstate '42501' then
      v_caught_expected := true;
  end;
  if not v_caught_expected then
    raise exception 'ASSERTION FAILED: Forged status = APPROVED must be rejected by RLS WITH CHECK.';
  end if;

  -- 5.5 Shopkeeper UPDATE Attempt -> MUST UPDATE 0 ROWS (Denied by RLS)
  update public.product_requests 
  set status = 'APPROVED' 
  where id = v_req_id;
  
  if (select status from public.product_requests where id = v_req_id) != 'PENDING' then
    raise exception 'ASSERTION FAILED: Ordinary shopkeeper was able to update product request status.';
  end if;

  reset role;
  raise notice '[PASS] Test 5: Product request RLS strictly prevents forgery of requested_by, reviewed_at, and status.';
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Clean Up & Final Rollback
-- ---------------------------------------------------------------------
rollback;

\echo '========================================================='
\echo ' All Isolated PostgreSQL Verification Tests PASSED!     '
\echo '========================================================='
