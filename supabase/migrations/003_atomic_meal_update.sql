-- Atomic edit of an owned meal and its full food list.
-- SECURITY INVOKER (default): RLS remains enforced for each table operation.
CREATE OR REPLACE FUNCTION public.update_meal(p_meal_id uuid, p_eaten_at timestamp with time zone, p_timezone text, p_meal_type text, p_raw_text text, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_uid text;
  v_item jsonb;
  v_count integer;
  v_updated integer;
begin
  v_uid := (select auth.jwt()->>'sub');
  if nullif(v_uid,'') is null then
    raise exception 'authentication required';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'items must be an array';
  end if;
  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 15 then
    raise exception '1-15 foods required';
  end if;

  update public.meals
  set eaten_at = p_eaten_at, timezone = p_timezone, meal_type = p_meal_type,
      raw_text = coalesce(p_raw_text,''), notes = coalesce(p_notes,'')
  where id = p_meal_id and user_id = v_uid;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'meal not found or access denied' using errcode = 'P0002';
  end if;

  -- This replacement is transactional. A malformed food rolls back both
  -- the parent update and the previous-item deletion.
  delete from public.meal_items where meal_id = p_meal_id and user_id = v_uid;
  for v_item in select value from jsonb_array_elements(p_items) loop
    insert into public.meal_items(
      meal_id,user_id,name,quantity,unit,calories_kcal,protein_g,
      carbs_g,fat_g,nutrition_source,source_note
    ) values (
      p_meal_id,v_uid,v_item->>'name',nullif(v_item->>'quantity','')::numeric,
      coalesce(v_item->>'unit',''),
      nullif(v_item->>'calories_kcal','')::numeric,
      nullif(v_item->>'protein_g','')::numeric,
      nullif(v_item->>'carbs_g','')::numeric,
      nullif(v_item->>'fat_g','')::numeric,
      coalesce(v_item->>'nutrition_source','unknown'),
      coalesce(v_item->>'source_note','')
    );
  end loop;
  return p_meal_id;
end;
$function$

revoke all on function public.update_meal(uuid,timestamptz,text,text,text,text,jsonb) from public,anon;
grant execute on function public.update_meal(uuid,timestamptz,text,text,text,text,jsonb) to authenticated;
