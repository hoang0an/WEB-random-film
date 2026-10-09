begin;
alter table public.group_movies add column if not exists genres text[] not null default '{}';
create or replace function public.add_movie(gid uuid,movie jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  perform private.require_member(gid);
  insert into public.group_movies(group_id,tmdb_id,title,year,runtime,overview,poster,backdrop,genres,added_by)
  values(gid,(movie->>'id')::bigint,left(movie->>'title',300),left(coalesce(movie->>'year',''),4),nullif((movie->>'runtime')::integer,0),left(coalesce(movie->>'overview',''),10000),movie->>'poster',movie->>'backdrop',array(select left(value,80) from jsonb_array_elements_text(coalesce(nullif(movie->'genres','null'::jsonb),'[]'::jsonb)) limit 20),auth.uid()) returning id into mid;
  return mid;
end; $$;
commit;
