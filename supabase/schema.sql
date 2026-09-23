-- Ejecutar una sola vez en un proyecto NUEVO de Supabase.
begin;
create table public.admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, name text not null check(length(name) between 2 and 40));
create table public.rounds(id uuid primary key default gen_random_uuid(),name text not null,season text not null,stage text not null,deadline timestamptz not null,published boolean not null default true);
create table public.matches(id uuid primary key default gen_random_uuid(),round_id uuid not null references public.rounds(id),home text not null,away text not null,kickoff timestamptz not null,provider_id bigint unique,status text not null default 'scheduled' check(status in ('scheduled','live','finished','postponed','cancelled')),home_score int check(home_score between 0 and 99),away_score int check(away_score between 0 and 99),manual_override boolean not null default false,updated_at timestamptz default now(),check(home<>away),check(status<>'finished' or (home_score is not null and away_score is not null)));
create table public.picks(user_id uuid not null references public.profiles(id),match_id uuid not null references public.matches(id),choice text not null check(choice in ('L','E','V')),updated_at timestamptz not null default now(),primary key(user_id,match_id));
create index on public.matches(round_id);
create index on public.picks(match_id);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.admins where user_id=auth.uid())$$;
create function public.new_profile() returns trigger language plpgsql security definer set search_path='' as $$begin insert into public.profiles(id,name) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Jugador'),40));return new;end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.new_profile();
alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table public.picks enable row level security;
-- Solo nombres públicos, nunca correos. Pronósticos privados hasta el cierre.
create policy own_admin on public.admins for select to authenticated using(user_id=auth.uid());
create policy read_profiles on public.profiles for select to anon,authenticated using(true);
create policy read_rounds on public.rounds for select to anon,authenticated using(published);
create policy read_matches on public.matches for select to anon,authenticated using(exists(select 1 from public.rounds r where r.id=round_id and r.published));
create policy read_picks on public.picks for select to anon,authenticated using(user_id=auth.uid() or exists(select 1 from public.matches m join public.rounds r on r.id=m.round_id where m.id=match_id and r.published and now()>=r.deadline));
create policy admin_results on public.matches for update to authenticated using(public.is_admin()) with check(public.is_admin());
-- Sin escritura directa de pronósticos; solo RPC atómica con reloj del servidor.
revoke all on public.admins,public.profiles,public.rounds,public.matches,public.picks from anon,authenticated;
grant select on public.admins,public.profiles,public.rounds,public.matches,public.picks to authenticated;
grant select on public.profiles,public.rounds,public.matches,public.picks to anon;
grant update(status,home_score,away_score,manual_override,updated_at) on public.matches to authenticated;
create function public.submit_picks(p_round uuid,p_picks jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.rounds; expected int; received int;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para participar';end if;
 select * into r from public.rounds where id=p_round for update;
 if not found or not r.published then raise exception 'Jornada no disponible';end if;
 if clock_timestamp()>=r.deadline then raise exception 'Los pronósticos ya están cerrados';end if;
 if jsonb_typeof(p_picks)<>'array' then raise exception 'Formato inválido';end if;
 select count(*) into expected from public.matches where round_id=p_round;
 select count(distinct (x->>'match_id')::uuid) into received from jsonb_array_elements(p_picks) x;
 if expected=0 or received<>expected or jsonb_array_length(p_picks)<>expected then raise exception 'Completa todos los partidos, sin duplicados';end if;
 if exists(select 1 from jsonb_array_elements(p_picks) x where x->>'choice' is null or x->>'choice' not in ('L','E','V') or not exists(select 1 from public.matches m where m.id=(x->>'match_id')::uuid and m.round_id=p_round)) then raise exception 'Pronóstico inválido';end if;
 insert into public.picks(user_id,match_id,choice) select auth.uid(),(x->>'match_id')::uuid,x->>'choice' from jsonb_array_elements(p_picks) x on conflict(user_id,match_id) do update set choice=excluded.choice,updated_at=now();
end$$;
create function public.create_round(p_name text,p_season text,p_stage text,p_matches jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; cutoff timestamptz;
begin
 if not public.is_admin() then raise exception 'Solo el administrador puede publicar jornadas';end if;
 if length(trim(p_name)) not between 1 and 80 or length(trim(p_season)) not between 1 and 80 or p_stage not in ('Regular','Play-in','Cuartos · Ida','Cuartos · Vuelta','Semifinal · Ida','Semifinal · Vuelta','Final · Ida','Final · Vuelta') then raise exception 'Datos de jornada inválidos';end if;
 if jsonb_typeof(p_matches)<>'array' or jsonb_array_length(p_matches) not between 1 and 30 then raise exception 'Indica de 1 a 30 encuentros';end if;
 if exists(select 1 from jsonb_array_elements(p_matches) x where coalesce(length(trim(x->>'home')),0) not between 1 and 80 or coalesce(length(trim(x->>'away')),0) not between 1 and 80 or x->>'kickoff' is null) then raise exception 'Partido incompleto';end if;
 select min((x->>'kickoff')::timestamptz)-interval '24 hours' into cutoff from jsonb_array_elements(p_matches) x;
 if cutoff<=now() then raise exception 'El primer partido debe ser dentro de más de 24 horas';end if;
 insert into public.rounds(name,season,stage,deadline) values(trim(p_name),trim(p_season),p_stage,cutoff) returning id into rid;
 insert into public.matches(round_id,home,away,kickoff,provider_id) select rid,trim(x->>'home'),trim(x->>'away'),(x->>'kickoff')::timestamptz,(x->>'provider_id')::bigint from jsonb_array_elements(p_matches) x;
 return rid;
end$$;
-- El calendario publicado y su cierre no se cambian desde el navegador.
-- Si se adelanta un encuentro, el sincronizador puede adelantar el cierre, nunca reabrirlo.
create function public.sync_result(p_id uuid,p_status text,p_home int,p_away int,p_kickoff timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 select round_id into rid from public.matches where id=p_id;
 perform 1 from public.rounds where id=rid for update;
 update public.matches set status=p_status,home_score=p_home,away_score=p_away,kickoff=p_kickoff,updated_at=now() where id=p_id and not manual_override;
 if found then update public.rounds set deadline=least(deadline,p_kickoff-interval '24 hours') where id=rid;end if;
end$$;
revoke all on function public.new_profile() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.submit_picks(uuid,jsonb) from public;
revoke all on function public.create_round(text,text,text,jsonb) from public;
revoke all on function public.sync_result(uuid,text,int,int,timestamptz) from public;
grant execute on function public.submit_picks(uuid,jsonb),public.create_round(text,text,text,jsonb) to authenticated;
grant execute on function public.sync_result(uuid,text,int,int,timestamptz) to service_role;
commit;
