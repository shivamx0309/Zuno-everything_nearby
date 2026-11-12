-- =====================================================================
-- ZUNO — Central Product Catalog Governance, Product Requests & Atomic Inventory
-- Migration 00000000000012
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Product Requests Table (Shopkeeper Catalog Contribution Flow)
-- ---------------------------------------------------------------------
create table if not exists public.product_requests (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  product_name text not null,
  brand text,
  pack_size text,
  unit text not null default 'unit',
  suggested_price numeric(10, 2) check (suggested_price is null or suggested_price >= 0),
  notes text,
  image_url text,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure reviewed_at column exists if table was previously created without it in an earlier run
alter table public.product_requests add column if not exists reviewed_at timestamptz;

-- Indexes for request management
create index if not exists idx_product_requests_shop on public.product_requests (shop_id);
create index if not exists idx_product_requests_status on public.product_requests (status);
create index if not exists idx_product_requests_category on public.product_requests (category_id);
create index if not exists idx_product_requests_created on public.product_requests (created_at desc);

-- ---------------------------------------------------------------------
-- Product Catalog Variant Uniqueness Guard & Index
-- Canonical Identity: (category_id, lower(trim(name)), lower(trim(unit)))
-- ---------------------------------------------------------------------
create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_name on public.products (name);

-- Safely remove previous unsafe single-column index if it exists
drop index if exists public.idx_products_name_unique_normalized;

-- Precondition Guard: Check for duplicate product variants prior to index creation.
-- Does not delete or merge records automatically. Halts migration with clear explanation if duplicates exist.
do $$
declare
  v_dup_product_count integer;
begin
  select count(*) into v_dup_product_count
  from (
    select category_id, lower(trim(name)), lower(trim(unit)), count(*)
    from public.products
    group by category_id, lower(trim(name)), lower(trim(unit))
    having count(*) > 1
  ) dups;

  if v_dup_product_count > 0 then
    raise exception 'Migration 012 halted: % duplicate product variant groups detected in public.products on (category_id, lower(trim(name)), lower(trim(unit))). Data reconciliation required before creating composite unique index.', v_dup_product_count;
  end if;
end;
$$;

create unique index if not exists idx_products_category_name_unit_normalized
  on public.products (category_id, lower(trim(name)), lower(trim(unit)));

-- ---------------------------------------------------------------------
-- Inventory 1-to-1 Mapping Guard & Unique Index
-- ---------------------------------------------------------------------
-- Precondition Guard: Verify no duplicate shop_product_id records exist in inventory.
-- Does not delete or merge records automatically. Halts migration if legacy duplicates are present.
do $$
declare
  v_dup_inventory_count integer;
begin
  select count(*) into v_dup_inventory_count
  from (
    select shop_product_id, count(*)
    from public.inventory
    group by shop_product_id
    having count(*) > 1
  ) dups;

  if v_dup_inventory_count > 0 then
    raise exception 'Migration 012 halted: % duplicate shop_product_id groups detected in public.inventory. Data reconciliation required before creating unique index idx_inventory_shop_product_unique.', v_dup_inventory_count;
  end if;
end;
$$;

create unique index if not exists idx_inventory_shop_product_unique on public.inventory (shop_product_id);

-- ---------------------------------------------------------------------
-- 2. Row Level Security Policies for Product Requests
-- ---------------------------------------------------------------------
alter table public.product_requests enable row level security;

-- SELECT: Shop Owners and co-owners can view their own shop's product requests
drop policy if exists "product_requests_select_owner" on public.product_requests;
create policy "product_requests_select_owner" on public.product_requests
  for select using (
    exists (
      select 1 from public.shops s
      where s.id = product_requests.shop_id
      and (
        s.owner_id = auth.uid()
        or exists (
          select 1 from public.shop_members sm
          where sm.shop_id = s.id
          and sm.user_id = auth.uid()
          and sm.role = 'OWNER'
        )
      )
    )
    or public.is_admin_or_super(auth.uid())
  );

-- INSERT: Strict security validation for product request submission:
-- 1. requested_by MUST equal caller auth.uid()
-- 2. status MUST be 'PENDING'
-- 3. Initial review fields (reviewed_by, reviewed_at, rejection_reason) MUST be null
-- 4. Caller MUST own or co-own an approved shop in public.shops
-- (Admins can bypass for administrative operations)
drop policy if exists "product_requests_insert_owner" on public.product_requests;
create policy "product_requests_insert_owner" on public.product_requests
  for insert with check (
    public.is_admin_or_super(auth.uid())
    or (
      requested_by = auth.uid()
      and status = 'PENDING'
      and reviewed_by is null
      and reviewed_at is null
      and rejection_reason is null
      and exists (
        select 1 from public.shops s
        where s.id = product_requests.shop_id
        and s.is_approved = true
        and s.approval_status = 'APPROVED'
        and (
          s.owner_id = auth.uid()
          or exists (
            select 1 from public.shop_members sm
            where sm.shop_id = s.id
            and sm.user_id = auth.uid()
            and sm.role = 'OWNER'
          )
        )
      )
    )
  );

-- UPDATE: Only Administrators can update product requests (review, approve, reject).
-- Ordinary shopkeepers cannot modify or tamper with submitted requests.
drop policy if exists "product_requests_update_admin" on public.product_requests;
create policy "product_requests_update_admin" on public.product_requests
  for update using (
    public.is_admin_or_super(auth.uid())
  )
  with check (
    public.is_admin_or_super(auth.uid())
  );

-- DELETE: Intentionally omitted. Under PostgreSQL RLS, lack of a DELETE policy
-- forbids DELETE operations for non-superusers, guaranteeing an immutable audit trail.

-- ---------------------------------------------------------------------
-- 3. Atomic Shop Product Listing & Inventory Synchronization RPC
-- ---------------------------------------------------------------------
create or replace function public.upsert_shop_product_and_inventory(
  p_shop_id uuid,
  p_product_id uuid,
  p_price numeric,
  p_stock integer
) returns jsonb as $$
declare
  v_shop_product_id uuid;
  v_is_authorized boolean := false;
begin
  -- 1. Authentication check
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  -- 2. Input validation
  if p_shop_id is null or p_product_id is null then
    raise exception 'shop_id and product_id must not be null.';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Price must be greater than or equal to 0.';
  end if;

  if p_stock is null or p_stock < 0 then
    raise exception 'Stock must be greater than or equal to 0.';
  end if;

  -- 3. Authorization check (Owner, Co-Owner, or Admin)
  select exists (
    select 1 from public.shops s
    where s.id = p_shop_id
    and s.is_approved = true
    and s.approval_status = 'APPROVED'
    and (
      s.owner_id = auth.uid()
      or exists (
        select 1 from public.shop_members sm
        where sm.shop_id = s.id
        and sm.user_id = auth.uid()
        and sm.role = 'OWNER'
      )
    )
  ) or public.is_admin_or_super(auth.uid()) into v_is_authorized;

  if not v_is_authorized then
    raise exception 'Security violation: caller is not authorized to manage products for shop %', p_shop_id;
  end if;

  -- 4. Verify product exists in central catalog
  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product % not found in central catalog.', p_product_id;
  end if;

  -- 5. Atomic Upsert into shop_products
  insert into public.shop_products (
    shop_id,
    product_id,
    price,
    stock,
    available
  ) values (
    p_shop_id,
    p_product_id,
    p_price,
    p_stock,
    (p_stock > 0)
  )
  on conflict (shop_id, product_id) do update set
    price = excluded.price,
    stock = excluded.stock,
    available = (excluded.stock > 0)
  returning id into v_shop_product_id;

  -- 6. Atomic Upsert into inventory
  insert into public.inventory (
    shop_product_id,
    quantity,
    updated_at
  ) values (
    v_shop_product_id,
    p_stock,
    now()
  )
  on conflict (shop_product_id) do update set
    quantity = excluded.quantity,
    updated_at = now();

  return jsonb_build_object(
    'success', true,
    'shop_product_id', v_shop_product_id,
    'price', p_price,
    'stock', p_stock
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function public.upsert_shop_product_and_inventory(uuid, uuid, numeric, integer) from public;
grant execute on function public.upsert_shop_product_and_inventory(uuid, uuid, numeric, integer) to authenticated;
