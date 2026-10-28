
-- Delete only the authenticated Clerk user's records in one transaction.
-- SECURITY INVOKER preserves RLS; no operator/admin bypass is created.
create or replace function public.purge_my_records()
returns void language plpgsql security invoker set search_path = '' as $$
declare me text;
begin
  me := (select auth.jwt()->>'sub');
  if me is null or me = '' then raise exception 'Authentication required'; end if;
  delete from public.meal_items where user_id = me;
  delete from public.meals where user_id = me;
  delete from public.sleep_sessions where user_id = me;
end;
$$;
revoke all on function public.purge_my_records() from public, anon;
grant execute on function public.purge_my_records() to authenticated;
