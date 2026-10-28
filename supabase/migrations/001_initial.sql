-- Meal & Sleep Agent — owner-only database. Run in Supabase SQL Editor on a NEW project.
-- The owner is the Clerk subject JWT claim (auth.jwt()->>'sub').
create extension if not exists pgcrypto;

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (length(user_id) between 8 and 128),
  eaten_at timestamptz not null,
  timezone text not null default 'Asia/Seoul' check (length(timezone) between 2 and 64),
  meal_type text not null default 'other' check (meal_type in ('breakfast','lunch','dinner','snack','other')),
  raw_text text not null default '' check (length(raw_text)<=2500),
  notes text not null default '' check (length(notes)<=1500),
  created_at timestamptz not null default now(),
  unique(id,user_id)
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null,
  user_id text not null check (length(user_id) between 8 and 128),
  name text not null check (length(trim(name)) between 1 and 140),
  quantity numeric(10,2) check (quantity>0 and quantity<=100000),
  unit text not null default '' check (length(unit)<=30),
  calories_kcal numeric(10,2) check (calories_kcal>=0 and calories_kcal<=100000),
  protein_g numeric(10,2) check (protein_g>=0 and protein_g<=100000),
  carbs_g numeric(10,2) check (carbs_g>=0 and carbs_g<=100000),
  fat_g numeric(10,2) check (fat_g>=0 and fat_g<=100000),
  nutrition_source text not null default 'unknown' check (nutrition_source in ('unknown','user_provided','verified_label','verified_database')),
  source_note text not null default '' check (length(source_note)<=500),
  created_at timestamptz not null default now(),
  foreign key(meal_id,user_id) references public.meals(id,user_id) on delete cascade
);

create table public.sleep_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null check (length(user_id) between 8 and 128),
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes int generated always as (round(extract(epoch from (end_at-start_at))/60)::int) stored,
  sleep_type text not null default 'main' check (sleep_type in ('main','nap')),
  quality smallint check (quality between 1 and 5),
  raw_text text not null default '' check (length(raw_text)<=2500),
  notes text not null default '' check (length(notes)<=1500),
  created_at timestamptz not null default now(),
  check (end_at>start_at and end_at-start_at<=interval '24 hours')
);

create index meals_user_eaten_idx on public.meals(user_id,eaten_at desc);
create index items_user_meal_idx on public.meal_items(user_id,meal_id);
create index sleep_user_end_idx on public.sleep_sessions(user_id,end_at desc);

alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.sleep_sessions enable row level security;

-- Defense in depth: authenticated users only; no wildcard public SELECTs.
revoke all on public.meals,public.meal_items,public.sleep_sessions from public,anon,authenticated;
grant select,insert,update,delete on public.meals,public.meal_items,public.sleep_sessions to authenticated;

create policy meals_select on public.meals for select to authenticated using ((select auth.jwt()->>'sub')=user_id);
create policy meals_insert on public.meals for insert to authenticated with check ((select auth.jwt()->>'sub')=user_id);
create policy meals_update on public.meals for update to authenticated using ((select auth.jwt()->>'sub')=user_id) with check ((select auth.jwt()->>'sub')=user_id);
create policy meals_delete on public.meals for delete to authenticated using ((select auth.jwt()->>'sub')=user_id);

create policy meal_items_select on public.meal_items for select to authenticated using ((select auth.jwt()->>'sub')=user_id);
create policy meal_items_insert on public.meal_items for insert to authenticated with check ((select auth.jwt()->>'sub')=user_id);
create policy meal_items_update on public.meal_items for update to authenticated using ((select auth.jwt()->>'sub')=user_id) with check ((select auth.jwt()->>'sub')=user_id);
create policy meal_items_delete on public.meal_items for delete to authenticated using ((select auth.jwt()->>'sub')=user_id);

create policy sleep_select on public.sleep_sessions for select to authenticated using ((select auth.jwt()->>'sub')=user_id);
create policy sleep_insert on public.sleep_sessions for insert to authenticated with check ((select auth.jwt()->>'sub')=user_id);
create policy sleep_update on public.sleep_sessions for update to authenticated using ((select auth.jwt()->>'sub')=user_id) with check ((select auth.jwt()->>'sub')=user_id);
create policy sleep_delete on public.sleep_sessions for delete to authenticated using ((select auth.jwt()->>'sub')=user_id);

-- Atomic insertion: one meal and all of its items or none.
-- SECURITY INVOKER ensures the user's RLS policies remain in effect.
create or replace function public.create_meal(
  p_eaten_at timestamptz,p_timezone text,p_meal_type text,
  p_raw_text text,p_notes text,p_items jsonb
) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_meal uuid; v_item jsonb; v_count int;
begin
  if nullif((select auth.jwt()->>'sub'),'') is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'items must be an array'; end if;
  v_count:=jsonb_array_length(p_items);
  if v_count<1 or v_count>15 then raise exception '1-15 foods required'; end if;
  insert into public.meals(user_id,eaten_at,timezone,meal_type,raw_text,notes)
  values((select auth.jwt()->>'sub'),p_eaten_at,p_timezone,p_meal_type,coalesce(p_raw_text,''),coalesce(p_notes,'')) returning id into v_meal;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.meal_items(meal_id,user_id,name,quantity,unit,calories_kcal,protein_g,carbs_g,fat_g,nutrition_source,source_note)
    values(v_meal,(select auth.jwt()->>'sub'),v_item->>'name',nullif(v_item->>'quantity','')::numeric,coalesce(v_item->>'unit',''),
      nullif(v_item->>'calories_kcal','')::numeric,nullif(v_item->>'protein_g','')::numeric,
      nullif(v_item->>'carbs_g','')::numeric,nullif(v_item->>'fat_g','')::numeric,
      coalesce(v_item->>'nutrition_source','unknown'),coalesce(v_item->>'source_note',''));
  end loop;
  return v_meal;
end $$;
revoke all on function public.create_meal(timestamptz,text,text,text,text,jsonb) from public,anon;
grant execute on function public.create_meal(timestamptz,text,text,text,text,jsonb) to authenticated;
