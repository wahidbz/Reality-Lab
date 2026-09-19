-- ===========================================================================
-- REALITY LAB — test data / seed helpers
-- ===========================================================================
-- Optional. The app works with zero seeded data (it generates demos in the
-- browser), but this file lets you populate a Supabase project with realistic
-- rows for screenshots, QA or load checks.
--
-- Usage:
--   1. Sign in to the app once so an auth.users row exists.
--   2. Replace <USER_UUID> below with that user id.
--   3. Run the statements in the Supabase SQL editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- A completed public demo simulation
-- ---------------------------------------------------------------------------
insert into public.simulations
  (user_id, name, description, type, country, city, target_audience, currency,
   budget, price, duration_months, status, seed, is_public, input_json, score)
values
  ('<USER_UUID>',
   'Student Coffee Shop — Berlin',
   'A low-cost coffee shop targeting university students in Berlin, with a tight budget and low prices.',
   'business', 'Germany', 'Berlin', 'Students', 'EUR',
   22000, 2.9, 12, 'completed', 20240501, true,
   jsonb_build_object(
     'name', 'Student Coffee Shop — Berlin',
     'city', 'Berlin',
     'country', 'Germany',
     'targetAudience', 'Students',
     'audienceKey', 'students',
     'currency', 'EUR',
     'budget', 22000,
     'price', 2.9,
     'durationMonths', 12,
     'marketingBudget', 900,
     'competitorCount', 5,
     'quality', 0.5,
     'seed', 20240501
   ),
   58);

-- ---------------------------------------------------------------------------
-- A private draft + a What-If variant pair
-- ---------------------------------------------------------------------------
with parent as (
  insert into public.simulations
    (user_id, name, description, type, country, city, target_audience, currency,
     budget, price, duration_months, status, seed, is_public, input_json, score)
  values
    ('<USER_UUID>', 'Premium Coffee Bar — London',
     'A premium coffee bar for professionals in central London.',
     'business', 'United Kingdom', 'London', 'Professionals', 'GBP',
     85000, 5.8, 12, 'completed', 771900, false,
     jsonb_build_object('name', 'Premium Coffee Bar — London', 'city', 'London', 'country', 'United Kingdom',
                        'targetAudience', 'Professionals', 'audienceKey', 'professionals', 'currency', 'GBP',
                        'budget', 85000, 'price', 5.8, 'durationMonths', 12, 'marketingBudget', 4200,
                        'competitorCount', 7, 'quality', 0.82, 'seed', 771900),
     71)
  returning id
),
variant as (
  insert into public.simulations
    (user_id, name, description, type, country, city, target_audience, currency,
     budget, price, duration_months, status, seed, is_public, parent_simulation_id, input_json, score)
  select
    '<USER_UUID>', 'Premium Coffee Bar — London (What-If)',
    'Variant: lower price and a larger marketing budget.',
    'business', 'United Kingdom', 'London', 'Professionals', 'GBP',
    85000, 4.6, 12, 'completed', 771900, false, parent.id,
    jsonb_build_object('name', 'Premium Coffee Bar — London (What-If)', 'city', 'London', 'country', 'United Kingdom',
                       'targetAudience', 'Professionals', 'audienceKey', 'professionals', 'currency', 'GBP',
                       'budget', 85000, 'price', 4.6, 'durationMonths', 12, 'marketingBudget', 6500,
                       'competitorCount', 7, 'quality', 0.82, 'seed', 771900),
    76
  from parent
  returning id, parent_simulation_id
)
insert into public.scenario_variants (parent_simulation_id, variant_simulation_id, changes_json)
select parent_simulation_id, id,
       jsonb_build_object(
         'price',           jsonb_build_object('from', 5.8,  'to', 4.6),
         'marketingBudget', jsonb_build_object('from', 4200, 'to', 6500)
       )
from variant;

-- ---------------------------------------------------------------------------
-- Useful QA queries
-- ---------------------------------------------------------------------------
-- All public simulations (what /explore shows):
--   select name, city, score, seed from public.simulations where is_public order by updated_at desc;
--
-- Variants of a simulation:
--   select v.variant_simulation_id, v.changes_json
--   from public.scenario_variants v
--   where v.parent_simulation_id = '<SIM_UUID>';
--
-- Rounds of a simulation (verifies the engine persisted real metrics):
--   select round_number, (metrics_json ->> 'revenue')::numeric as revenue,
--          (metrics_json ->> 'profit')::numeric  as profit
--   from public.simulation_rounds
--   where simulation_id = '<SIM_UUID>'
--   order by round_number;
