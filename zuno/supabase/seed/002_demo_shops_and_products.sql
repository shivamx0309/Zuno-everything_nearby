-- =====================================================================
-- ZUNO Development-Only Demo Multi-Shop Catalog Seed
-- Do NOT run against production or staging.
-- Follows supabase/seed/README.md: seeds ONLY local demo shops,
-- categories, catalog products, shop_products, and inventory (zero fake
-- customers, orders, revenue, or analytics).
-- =====================================================================

-- Ensure auth.users rows exist on standalone/local PostgreSQL / Supabase
insert into auth.users (id, instance_id, aud, role, email, phone, encrypted_password, email_confirmed_at, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('d0000000-0000-4000-a000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'shop_919900000001@zuno.in', '+919900000001', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"SHOPKEEPER","full_name":"Demo Owner One"}'::jsonb),
  ('d0000000-0000-4000-a000-000000000002', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'shop_919900000002@zuno.in', '+919900000002', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"SHOPKEEPER","full_name":"Demo Owner Two"}'::jsonb),
  ('d0000000-0000-4000-a000-000000000003', '00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'shop_919900000003@zuno.in', '+919900000003', '', now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"role":"SHOPKEEPER","full_name":"Demo Owner Three"}'::jsonb)
on conflict (id) do nothing;

insert into public.profiles (id, role, full_name, phone)
values
  ('d0000000-0000-4000-a000-000000000001', 'SHOPKEEPER', 'Demo Owner One', '+919900000001'),
  ('d0000000-0000-4000-a000-000000000002', 'SHOPKEEPER', 'Demo Owner Two', '+919900000002'),
  ('d0000000-0000-4000-a000-000000000003', 'SHOPKEEPER', 'Demo Owner Three', '+919900000003')
on conflict (id) do nothing;

-- Local Approved Service Area
insert into public.service_areas (id, name, pincode, is_active)
values
  ('a0000000-0000-4000-a000-000000000231', 'Renukoot Central', '231217', true)
on conflict (pincode) do nothing;

-- Three Independent Local Demo Shops (PIN 231217)
insert into public.shops (
  id, owner_id, name, description, phone, address_line, locality, pincode,
  is_approved, approval_status, is_active, is_delivery_available, opening_hours,
  lat, lng, service_area_id
)
values
  (
    '50000000-0000-4000-b000-000000000001',
    'd0000000-0000-4000-a000-000000000001',
    'Zuno Demo Kirana Mart',
    'Grocery & Daily Essentials',
    '+919900000001',
    'Main Market Road, Shop 4',
    'Renukoot',
    '231217',
    true, 'APPROVED', true, true,
    '{
      "monday":    {"enabled": true, "open": "08:00", "close": "22:00"},
      "tuesday":   {"enabled": true, "open": "08:00", "close": "22:00"},
      "wednesday": {"enabled": true, "open": "08:00", "close": "22:00"},
      "thursday":  {"enabled": true, "open": "08:00", "close": "22:00"},
      "friday":    {"enabled": true, "open": "08:00", "close": "22:00"},
      "saturday":  {"enabled": true, "open": "08:00", "close": "22:00"},
      "sunday":    {"enabled": true, "open": "08:00", "close": "22:00"}
    }'::jsonb,
    24.2185, 83.0326,
    (select id from public.service_areas where pincode = '231217' limit 1)
  ),
  (
    '50000000-0000-4000-b000-000000000002',
    'd0000000-0000-4000-a000-000000000002',
    'Renukoot Fresh Produce',
    'Fruits & Vegetables',
    '+919900000002',
    'Subhash Chowk, Stall 12',
    'Renukoot',
    '231217',
    true, 'APPROVED', true, true,
    '{
      "monday":    {"enabled": true, "open": "07:00", "close": "21:00"},
      "tuesday":   {"enabled": true, "open": "07:00", "close": "21:00"},
      "wednesday": {"enabled": true, "open": "07:00", "close": "21:00"},
      "thursday":  {"enabled": true, "open": "07:00", "close": "21:00"},
      "friday":    {"enabled": true, "open": "07:00", "close": "21:00"},
      "saturday":  {"enabled": true, "open": "07:00", "close": "21:00"},
      "sunday":    {"enabled": false, "open": null, "close": null}
    }'::jsonb,
    24.2191, 83.0342,
    (select id from public.service_areas where pincode = '231217' limit 1)
  ),
  (
    '50000000-0000-4000-b000-000000000003',
    'd0000000-0000-4000-a000-000000000003',
    'Sonbhadra Daily Needs',
    'Grocery & Household (Demo Delivery Paused)',
    '+919900000003',
    'Hindalco Gate Road',
    'Renukoot',
    '231217',
    true, 'APPROVED', true, false,
    public.default_shop_opening_hours(),
    24.2169, 83.0308,
    (select id from public.service_areas where pincode = '231217' limit 1)
  )
on conflict (id) do nothing;

-- Central Catalog Categories & Products
insert into public.categories (id, name, slug, accent_color)
values
  ('c0000000-0000-4000-a000-000000000001', 'Grocery', 'grocery', '#22A06B'),
  ('c0000000-0000-4000-a000-000000000002', 'Vegetables', 'vegetables', '#A7D56B'),
  ('c0000000-0000-4000-a000-000000000003', 'Fruits', 'fruits', '#A7D56B')
on conflict (slug) do nothing;

insert into public.products (id, category_id, name, description, unit)
values
  ('60000000-0000-4000-b000-000000000001', (select id from public.categories where slug = 'vegetables' limit 1), 'Fresh Tomato', 'Locally grown ripe red tomatoes.', '1 kg'),
  ('60000000-0000-4000-b000-000000000002', (select id from public.categories where slug = 'vegetables' limit 1), 'Red Onion', 'Dry medium-size cooking onions.', '1 kg'),
  ('60000000-0000-4000-b000-000000000003', (select id from public.categories where slug = 'fruits' limit 1), 'Robusta Banana', 'Sweet ripe yellow bananas.', '1 dozen'),
  ('60000000-0000-4000-b000-000000000004', (select id from public.categories where slug = 'grocery' limit 1), 'Whole Wheat Atta', 'Stone-ground chakki fresh atta.', '5 kg'),
  ('60000000-0000-4000-b000-000000000005', (select id from public.categories where slug = 'grocery' limit 1), 'Toor Dal', 'Unpolished Arhar dal.', '1 kg')
on conflict (id) do nothing;

-- Shop-Specific Price & Stock Listings
insert into public.shop_products (id, shop_id, product_id, price, stock, available)
values
  ('30000000-0000-4000-b000-000000000101', '50000000-0000-4000-b000-000000000001', '60000000-0000-4000-b000-000000000004', 225.00, 18, true),
  ('30000000-0000-4000-b000-000000000102', '50000000-0000-4000-b000-000000000001', '60000000-0000-4000-b000-000000000005', 148.00, 24, true),
  ('30000000-0000-4000-b000-000000000103', '50000000-0000-4000-b000-000000000001', '60000000-0000-4000-b000-000000000001', 26.00, 15, true),

  ('30000000-0000-4000-b000-000000000201', '50000000-0000-4000-b000-000000000002', '60000000-0000-4000-b000-000000000001', 22.00, 30, true),
  ('30000000-0000-4000-b000-000000000202', '50000000-0000-4000-b000-000000000002', '60000000-0000-4000-b000-000000000002', 30.00, 25, true),
  ('30000000-0000-4000-b000-000000000203', '50000000-0000-4000-b000-000000000002', '60000000-0000-4000-b000-000000000003', 45.00, 12, true),

  ('30000000-0000-4000-b000-000000000301', '50000000-0000-4000-b000-000000000003', '60000000-0000-4000-b000-000000000004', 218.00, 10, true)
on conflict (shop_id, product_id) do nothing;

insert into public.inventory (shop_product_id, quantity, updated_at)
values
  ('30000000-0000-4000-b000-000000000101', 18, now()),
  ('30000000-0000-4000-b000-000000000102', 24, now()),
  ('30000000-0000-4000-b000-000000000103', 15, now()),
  ('30000000-0000-4000-b000-000000000201', 30, now()),
  ('30000000-0000-4000-b000-000000000202', 25, now()),
  ('30000000-0000-4000-b000-000000000203', 12, now()),
  ('30000000-0000-4000-b000-000000000301', 10, now())
on conflict do nothing;
