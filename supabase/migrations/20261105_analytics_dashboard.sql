-- Mesure d'audience anonyme + tableau de bord administrateur.
-- Appliqué au projet Supabase le 2026-11-05 (migration « analytics_dashboard »).
-- Aucun cookie, aucune donnée personnelle : identifiant aléatoire par appareil,
-- pages consultées et actions clés uniquement. Rétention 12 mois.

-- 1) Rôle administrateur (seul l'admin voit les statistiques)
alter table public.profiles add column if not exists is_admin boolean not null default false;
update public.profiles set is_admin = true where id = '001067c9-322c-49e6-874b-5a7b9313ec37';

-- 2) Journal des événements anonymes
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  event text not null check (event in ('page_view','join_classroom','install_click','app_installed')),
  page text not null default '' check (char_length(page) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_idx on public.analytics_events (created_at);
create index if not exists analytics_events_visitor_idx on public.analytics_events (visitor_id, created_at);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;
-- Aucune politique d'accès direct : tout passe par les fonctions SECURITY DEFINER.

-- 3) Collecte (appelée par le site, silencieuse et anti-abus)
create or replace function public.api_track_event(p_visitor_id uuid, p_event text, p_page text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor_id is null then return; end if;
  if p_event is null or p_event not in ('page_view','join_classroom','install_click','app_installed') then return; end if;
  if p_page is null then p_page := ''; end if;
  if char_length(p_page) > 40 or p_page !~ '^[a-z_]*$' then return; end if;
  -- Anti-abus : 300 événements / heure / visiteur maximum.
  if (select count(*) from public.analytics_events
      where visitor_id = p_visitor_id and created_at > now() - interval '1 hour') >= 300 then
    return;
  end if;
  insert into public.analytics_events (visitor_id, event, page) values (p_visitor_id, p_event, p_page);
  -- Rétention 12 mois (nettoyage opportuniste).
  if random() < 0.02 then
    delete from public.analytics_events where created_at < now() - interval '365 days';
  end if;
end;
$$;
revoke all on function public.api_track_event(uuid, text, text) from public;
grant execute on function public.api_track_event(uuid, text, text) to anon, authenticated;

-- 4) Le compte connecté est-il administrateur ?
create or replace function public.api_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;
revoke all on function public.api_is_admin() from public;
grant execute on function public.api_is_admin() to anon, authenticated;

-- 5) Statistiques réservées à l'administrateur
create or replace function public.api_admin_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_today date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_start timestamptz := ((v_today - (v_days - 1))::timestamp at time zone 'Africa/Porto-Novo');
  result jsonb;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'ADMIN_ONLY' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'days', v_days,
    'generated_at', now(),
    'totals', (select jsonb_build_object(
      'visitors_today', count(distinct visitor_id) filter (where (created_at at time zone 'Africa/Porto-Novo')::date = v_today),
      'visitors_7d', count(distinct visitor_id) filter (where created_at >= ((v_today - 6)::timestamp at time zone 'Africa/Porto-Novo')),
      'visitors_30d', count(distinct visitor_id) filter (where created_at >= ((v_today - 29)::timestamp at time zone 'Africa/Porto-Novo')),
      'visitors_total', count(distinct visitor_id),
      'views_today', count(*) filter (where (created_at at time zone 'Africa/Porto-Novo')::date = v_today),
      'views_7d', count(*) filter (where created_at >= ((v_today - 6)::timestamp at time zone 'Africa/Porto-Novo')),
      'views_period', count(*) filter (where created_at >= v_start)
    ) from public.analytics_events where event = 'page_view'),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'visitors', v, 'views', pv) order by d), '[]'::jsonb)
      from (
        select d::date as d,
          (select count(distinct visitor_id) from public.analytics_events e
            where e.event = 'page_view' and (e.created_at at time zone 'Africa/Porto-Novo')::date = d::date) as v,
          (select count(*) from public.analytics_events e
            where e.event = 'page_view' and (e.created_at at time zone 'Africa/Porto-Novo')::date = d::date) as pv
        from generate_series(v_today - (v_days - 1), v_today, interval '1 day') as d
      ) s),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('page', page, 'views', n) order by n desc), '[]'::jsonb)
      from (select page, count(*) as n from public.analytics_events
            where event = 'page_view' and created_at >= v_start and page <> ''
            group by page order by n desc limit 8) t),
    'events', (select coalesce(jsonb_object_agg(event, n), '{}'::jsonb)
      from (select event, count(*) as n from public.analytics_events
            where event <> 'page_view' and created_at >= v_start group by event) t),
    'business', jsonb_build_object(
      'classrooms', (select count(*) from public.classrooms),
      'classrooms_active', (select count(*) from public.classrooms where not is_archived),
      'subjects', (select count(*) from public.subjects),
      'documents', (select count(*) from public.documents),
      'owners', (select count(*) from public.profiles where email not like '%@example.com'),
      'student_sessions', (select count(*) from public.student_sessions),
      'student_sessions_active_7d', (select count(*) from public.student_sessions
        where last_seen_at > now() - interval '7 days' and expires_at > now()),
      'devices', (select count(*) from public.student_devices)
    )
  ) into result;
  return result;
end;
$$;
revoke all on function public.api_admin_stats(integer) from public, anon;
grant execute on function public.api_admin_stats(integer) to authenticated;
