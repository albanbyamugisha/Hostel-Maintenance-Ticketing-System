-- ============================================================================
-- HostelCare — Hostel Maintenance Ticketing System
-- Supabase / PostgreSQL schema
--
-- This file is idempotent: it can be run more than once in the Supabase SQL
-- editor. It creates enums, tables, indexes, helper functions, RPCs, RLS
-- policies, the private photo bucket and realtime publication entries.
--
-- Run order: schema.sql, then (optionally) seed.sql.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.user_role as enum ('resident', 'technician', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_category as enum ('plumbing', 'electrical', 'carpentry_structure');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_severity as enum ('low', 'medium', 'high', 'emergency');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_status as enum
    ('reported', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'reopened');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.technician_specialty as enum
    ('plumbing', 'electrical', 'carpentry_structure', 'general');
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- Human-friendly tracking IDs: HMT-2026-000123
create sequence if not exists public.ticket_tracking_seq start with 1 increment by 1;

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  full_name    text not null check (char_length(full_name) between 2 and 80),
  phone        text check (phone is null or char_length(phone) between 7 and 20),
  role         public.user_role not null default 'resident',
  specialty    public.technician_specialty,
  block        text check (block is null or char_length(block) between 1 and 20),
  room_number  text check (room_number is null or char_length(room_number) between 1 and 10),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_technician_specialty
    check (role <> 'technician' or specialty is not null)
);

create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  tracking_id    text not null unique
                 default ('HMT-' || to_char(now(), 'YYYY') || '-' ||
                          lpad(nextval('public.ticket_tracking_seq')::text, 6, '0')),
  resident_id    uuid not null references public.profiles (id) on delete restrict,
  block          text not null check (char_length(block) between 1 and 20),
  floor          text not null check (char_length(floor) between 1 and 10),
  room_number    text not null check (char_length(room_number) between 1 and 10),
  location_type  text not null check (location_type in ('room', 'common_area')),
  category       public.ticket_category not null,
  severity       public.ticket_severity not null,
  title          text not null check (char_length(title) between 5 and 120),
  description    text not null check (char_length(description) between 10 and 2000),
  photo_paths    text[] not null default '{}'
                 check (coalesce(array_length(photo_paths, 1), 0) <= 3),
  status         public.ticket_status not null default 'reported',
  assigned_to    uuid references public.profiles (id) on delete set null,
  assigned_by    uuid references public.profiles (id) on delete set null,
  target_date    date,
  hold_reason    text check (hold_reason is null or char_length(hold_reason) <= 500),
  resolved_at    timestamptz,
  closed_at      timestamptz,
  rating         smallint check (rating is null or rating between 1 and 5),
  feedback       text check (feedback is null or char_length(feedback) <= 1000),
  reopen_count   integer not null default 0 check (reopen_count >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.ticket_events (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.tickets (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  event_type   text not null check (event_type in (
                 'created', 'assigned', 'reassigned', 'status_change',
                 'note', 'work_log', 'parts_used', 'rating', 'reopened')),
  from_status  public.ticket_status,
  to_status    public.ticket_status,
  message      text check (message is null or char_length(message) <= 2000),
  parts_used   text check (parts_used is null or char_length(parts_used) <= 500),
  photo_paths  text[] not null default '{}'
               check (coalesce(array_length(photo_paths, 1), 0) <= 3),
  created_at   timestamptz not null default now()
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  ticket_id   uuid references public.tickets (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 120),
  body        text not null check (char_length(body) between 1 and 500),
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index if not exists tickets_resident_idx      on public.tickets (resident_id);
create index if not exists tickets_assigned_idx      on public.tickets (assigned_to);
create index if not exists tickets_status_idx        on public.tickets (status);
create index if not exists tickets_created_idx       on public.tickets (created_at desc);
create index if not exists tickets_target_date_idx   on public.tickets (target_date);
create index if not exists tickets_block_idx         on public.tickets (block);
create index if not exists events_ticket_idx         on public.ticket_events (ticket_id, created_at);
create index if not exists notifications_user_idx    on public.notifications (user_id, is_read, created_at desc);
create index if not exists profiles_role_idx         on public.profiles (role);

-- ---------------------------------------------------------------------------
-- 4. Helper functions
-- ---------------------------------------------------------------------------

-- Current caller's role, or null when signed out / inactive.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_uuid(p_value text)
returns boolean
language sql
immutable
as $$
  select p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Used by ticket/event RLS. Security definer avoids recursive RLS lookups.
create or replace function public.can_access_ticket(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tickets t
    where t.id = p_ticket_id
      and public.my_role() is not null
      and (
        public.is_admin()
        or (public.my_role() = 'resident' and t.resident_id = auth.uid())
        or (public.my_role() = 'technician' and t.assigned_to = auth.uid())
      )
  )
$$;

-- Profiles are visible to their owner, admins and ticket participants.
-- The audit actor lookup also permits names on a shared ticket timeline.
create or replace function public.can_view_profile(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.my_role() is not null and (
    p_profile_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.tickets t
      where (t.resident_id = auth.uid() and t.assigned_to = p_profile_id)
         or (t.assigned_to = auth.uid() and t.resident_id = p_profile_id)
    )
    or exists (
      select 1
      from public.ticket_events e
      join public.tickets t on t.id = e.ticket_id
      where e.actor_id = p_profile_id
        and (t.resident_id = auth.uid() or t.assigned_to = auth.uid())
    ))
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Internal notification helper. Not callable by clients.
create or replace function public.notify_user(
  p_user_id uuid,
  p_ticket_id uuid,
  p_title text,
  p_body text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, ticket_id, title, body)
  values (p_user_id, p_ticket_id, left(p_title, 120), left(p_body, 500));
$$;

revoke all on function public.notify_user(uuid, uuid, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- Create a resident profile whenever an auth user signs up. The role is
-- forced to resident regardless of any metadata supplied by the client.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name  text;
  v_phone text;
  v_block text;
  v_room  text;
begin
  v_name := btrim(coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  if char_length(v_name) < 2 then
    v_name := 'Resident';
  end if;

  v_phone := btrim(coalesce(new.raw_user_meta_data ->> 'phone', ''));
  if char_length(v_phone) < 7 or char_length(v_phone) > 20 then
    v_phone := null;
  end if;

  v_block := left(btrim(coalesce(new.raw_user_meta_data ->> 'block', '')), 20);
  if v_block = '' then v_block := null; end if;

  v_room := left(btrim(coalesce(new.raw_user_meta_data ->> 'room_number', '')), 10);
  if v_room = '' then v_room := null; end if;

  insert into public.profiles (id, email, full_name, phone, block, room_number, role)
  values (
    new.id,
    new.email,
    left(v_name, 80),
    v_phone,
    v_block,
    v_room,
    'resident'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists tickets_touch_updated_at on public.tickets;
create trigger tickets_touch_updated_at
  before update on public.tickets
  for each row execute function public.touch_updated_at();

-- Guard profile updates: only admins may change role/specialty/is_active.
-- auth.uid() is null for SQL-editor / service-role operations, which are
-- trusted (used for bootstrapping the first admin and seed data).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_admin() then
    if new.id is distinct from old.id
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.specialty is distinct from old.specialty
       or new.is_active is distinct from old.is_active
       or new.created_at is distinct from old.created_at then
      raise exception 'You may only update your name, phone, block and room number.'
        using errcode = '42501';
    end if;
    if old.id <> auth.uid() then
      raise exception 'You may only update your own profile.' using errcode = '42501';
    end if;
  else
    -- Admins cannot lock themselves out or demote themselves.
    if old.id = auth.uid() and (new.role <> 'admin' or new.is_active = false) then
      raise exception 'You cannot demote or deactivate your own admin account.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- 6. State-machine RPCs — the ONLY way clients may change ticket state
-- ---------------------------------------------------------------------------

-- Resident creates a ticket -> reported.
create or replace function public.create_ticket(
  p_block         text,
  p_floor         text,
  p_room_number   text,
  p_location_type text,
  p_category      public.ticket_category,
  p_severity      public.ticket_severity,
  p_title         text,
  p_description   text,
  p_photo_paths   text[] default '{}'
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_ticket  public.tickets;
  v_admin   record;
  v_paths   text[] := coalesce(p_photo_paths, '{}');
  v_title   text := btrim(coalesce(p_title, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_block   text := btrim(coalesce(p_block, ''));
  v_floor   text := btrim(coalesce(p_floor, ''));
  v_room    text := btrim(coalesce(p_room_number, ''));
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and is_active;

  if not found then
    raise exception 'You must be signed in with an active account.' using errcode = '42501';
  end if;

  if v_profile.role <> 'resident' then
    raise exception 'Only residents can report issues.' using errcode = '42501';
  end if;

  if char_length(v_block) not between 1 and 20 then
    raise exception 'Please choose a valid block.' using errcode = '22023';
  end if;
  if char_length(v_floor) not between 1 and 10 then
    raise exception 'Please enter a valid floor.' using errcode = '22023';
  end if;
  if char_length(v_room) not between 1 and 10 then
    raise exception 'Please enter a valid room or area.' using errcode = '22023';
  end if;
  if p_location_type not in ('room', 'common_area') then
    raise exception 'Location type must be room or common_area.' using errcode = '22023';
  end if;
  if char_length(v_title) not between 5 and 120 then
    raise exception 'Title must be between 5 and 120 characters.' using errcode = '22023';
  end if;
  if char_length(v_desc) not between 10 and 2000 then
    raise exception 'Description must be between 10 and 2000 characters.' using errcode = '22023';
  end if;
  if coalesce(array_length(v_paths, 1), 0) > 3 then
    raise exception 'A ticket can have at most 3 photos.' using errcode = '22023';
  end if;

  insert into public.tickets (
    resident_id, block, floor, room_number, location_type,
    category, severity, title, description, photo_paths, status
  )
  values (
    auth.uid(), v_block, v_floor, v_room, p_location_type,
    p_category, p_severity, v_title, v_desc, v_paths, 'reported'
  )
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, to_status, message, photo_paths)
  values
    (v_ticket.id, auth.uid(), 'created', 'reported', 'Issue reported by resident.', v_paths);

  for v_admin in
    select id from public.profiles where role = 'admin' and is_active
  loop
    perform public.notify_user(
      v_admin.id,
      v_ticket.id,
      case when p_severity = 'emergency'
           then 'EMERGENCY reported: ' || v_ticket.tracking_id
           else 'New ticket: ' || v_ticket.tracking_id end,
      v_ticket.title || ' · ' || v_ticket.block || ' / ' || v_ticket.room_number ||
        ' · ' || initcap(replace(p_severity::text, '_', ' '))
    );
  end loop;

  return v_ticket;
end;
$$;

-- Admin assigns/reassigns a technician -> assigned.
create or replace function public.assign_ticket(
  p_ticket_id     uuid,
  p_technician_id uuid,
  p_target_date   date default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin  public.profiles;
  v_ticket public.tickets;
  v_tech   public.profiles;
  v_old    public.ticket_status;
  v_event  text;
begin
  select * into v_admin
  from public.profiles
  where id = auth.uid() and is_active and role = 'admin';
  if not found then
    raise exception 'Only an active admin can assign tickets.' using errcode = '42501';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;

  if v_ticket.status not in ('reported', 'reopened', 'assigned') then
    raise exception 'A ticket in "%" status cannot be assigned. Reopen it first.',
      replace(v_ticket.status::text, '_', ' ') using errcode = '22023';
  end if;

  select * into v_tech
  from public.profiles
  where id = p_technician_id and role = 'technician' and is_active;
  if not found then
    raise exception 'Choose an active technician.' using errcode = '22023';
  end if;

  if p_target_date is not null and p_target_date < current_date then
    raise exception 'Target completion date cannot be in the past.' using errcode = '22023';
  end if;

  v_old := v_ticket.status;
  v_event := case when v_old = 'assigned' then 'reassigned' else 'assigned' end;

  update public.tickets
  set assigned_to = v_tech.id,
      assigned_by = auth.uid(),
      target_date = p_target_date,
      status = 'assigned',
      hold_reason = null
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, from_status, to_status, message)
  values (
    v_ticket.id, auth.uid(), v_event, v_old, 'assigned',
    case when v_event = 'reassigned' then 'Reassigned to ' else 'Assigned to ' end ||
      v_tech.full_name ||
      case when p_target_date is not null
           then ' · target ' || to_char(p_target_date, 'DD Mon YYYY')
           else '' end
  );

  perform public.notify_user(
    v_tech.id, v_ticket.id,
    'New job assigned: ' || v_ticket.tracking_id,
    v_ticket.title || ' · ' || v_ticket.block || ' / ' || v_ticket.room_number ||
      case when p_target_date is not null
           then ' · due ' || to_char(p_target_date, 'DD Mon YYYY')
           else '' end
  );

  perform public.notify_user(
    v_ticket.resident_id, v_ticket.id,
    'Your ticket is assigned: ' || v_ticket.tracking_id,
    'A technician (' || v_tech.full_name || ') has been assigned to your repair.' ||
      case when p_target_date is not null
           then ' Target date: ' || to_char(p_target_date, 'DD Mon YYYY') || '.'
           else '' end
  );

  return v_ticket;
end;
$$;

-- Assigned technician moves the job forward. Only valid transitions allowed.
create or replace function public.technician_update_status(
  p_ticket_id  uuid,
  p_new_status public.ticket_status,
  p_note       text default null,
  p_parts_used text default null,
  p_photo_paths text[] default '{}'
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tech   public.profiles;
  v_ticket public.tickets;
  v_note   text := btrim(coalesce(p_note, ''));
  v_parts  text := nullif(btrim(coalesce(p_parts_used, '')), '');
  v_paths  text[] := coalesce(p_photo_paths, '{}');
  v_admin  record;
  v_event  text := 'status_change';
  v_old    public.ticket_status;
begin
  select * into v_tech
  from public.profiles
  where id = auth.uid() and is_active and role = 'technician';
  if not found then
    raise exception 'Only an active technician can update job status.' using errcode = '42501';
  end if;

  select * into v_ticket
  from public.tickets
  where id = p_ticket_id
  for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;

  if v_ticket.assigned_to is distinct from auth.uid() then
    raise exception 'This ticket is not assigned to you.' using errcode = '42501';
  end if;

  -- Validate the transition.
  if v_ticket.status = 'assigned' and p_new_status = 'in_progress' then
    null;
  elsif v_ticket.status = 'in_progress' and p_new_status = 'on_hold' then
    if char_length(v_note) not between 3 and 500 then
      raise exception 'A reason of 3–500 characters is required to put a job on hold.' using errcode = '22023';
    end if;
  elsif v_ticket.status = 'on_hold' and p_new_status = 'in_progress' then
    null;
  elsif v_ticket.status = 'in_progress' and p_new_status = 'resolved' then
    if char_length(v_note) < 10 then
      raise exception 'A work log of at least 10 characters is required to resolve a job.'
        using errcode = '22023';
    end if;
    v_event := 'work_log';
  elsif v_ticket.status = 'reopened' and p_new_status = 'in_progress' then
    null;
  else
    raise exception 'Invalid transition from "%" to "%".',
      replace(v_ticket.status::text, '_', ' '),
      replace(p_new_status::text, '_', ' ')
      using errcode = '22023';
  end if;

  if char_length(v_note) > 2000 then
    raise exception 'Note must be 2000 characters or fewer.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_parts, '')) > 500 then
    raise exception 'Parts used must be 500 characters or fewer.' using errcode = '22023';
  end if;
  if coalesce(array_length(v_paths, 1), 0) > 3 then
    raise exception 'At most 3 photos can be attached.' using errcode = '22023';
  end if;

  v_old := v_ticket.status;

  update public.tickets
  set status = p_new_status,
      hold_reason = case when p_new_status = 'on_hold' then v_note else null end,
      resolved_at = case when p_new_status = 'resolved' then now() else resolved_at end
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, from_status, to_status, message, parts_used, photo_paths)
  values (
    v_ticket.id, auth.uid(), v_event, v_old, p_new_status,
    nullif(v_note, ''), v_parts, v_paths
  );

  if p_new_status = 'resolved' then
    perform public.notify_user(
      v_ticket.resident_id, v_ticket.id,
      'Work completed: ' || v_ticket.tracking_id,
      'The maintenance work has been finished. Please confirm and close the ticket, or reject it if the issue is not fixed.'
    );
  elsif p_new_status = 'on_hold' then
    for v_admin in
      select id from public.profiles where role = 'admin' and is_active
    loop
      perform public.notify_user(
        v_admin.id, v_ticket.id,
        'Job on hold: ' || v_ticket.tracking_id,
        v_ticket.title || ' · ' || v_note
      );
    end loop;
  end if;

  return v_ticket;
end;
$$;

-- Technician (or admin) adds a work log / parts used without changing status.
create or replace function public.add_work_log(
  p_ticket_id  uuid,
  p_note       text,
  p_parts_used text default null,
  p_photo_paths text[] default '{}'
)
returns public.ticket_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_ticket  public.tickets;
  v_event   public.ticket_events;
  v_note    text := btrim(coalesce(p_note, ''));
  v_parts   text := nullif(btrim(coalesce(p_parts_used, '')), '');
  v_paths   text[] := coalesce(p_photo_paths, '{}');
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and is_active;
  if not found then
    raise exception 'You must be signed in with an active account.' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;

  if not (
    (v_profile.role = 'technician' and v_ticket.assigned_to is not distinct from auth.uid())
    or v_profile.role = 'admin'
  ) then
    raise exception 'Only the assigned technician or an admin can add a work log.'
      using errcode = '42501';
  end if;

  if v_ticket.status not in ('assigned', 'in_progress', 'on_hold', 'reopened') then
    raise exception 'Work logs can only be added to active jobs.' using errcode = '22023';
  end if;
  if char_length(v_note) not between 3 and 2000 then
    raise exception 'Work log must be between 3 and 2000 characters.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_parts, '')) > 500 then
    raise exception 'Parts used must be 500 characters or fewer.' using errcode = '22023';
  end if;
  if coalesce(array_length(v_paths, 1), 0) > 3 then
    raise exception 'At most 3 photos can be attached.' using errcode = '22023';
  end if;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, message, parts_used, photo_paths)
  values (v_ticket.id, auth.uid(), 'work_log', v_note, v_parts, v_paths)
  returning * into v_event;

  perform public.notify_user(
    v_ticket.resident_id, v_ticket.id,
    'Work update: ' || v_ticket.tracking_id,
    left(v_note, 300)
  );

  return v_event;
end;
$$;

-- Any participant can add a note.
create or replace function public.add_ticket_note(
  p_ticket_id uuid,
  p_message   text
)
returns public.ticket_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_ticket  public.tickets;
  v_event   public.ticket_events;
  v_msg     text := btrim(coalesce(p_message, ''));
  v_admin   record;
begin
  select * into v_profile
  from public.profiles
  where id = auth.uid() and is_active;
  if not found then
    raise exception 'You must be signed in with an active account.' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;

  if not public.can_access_ticket(p_ticket_id) then
    raise exception 'You are not a participant on this ticket.' using errcode = '42501';
  end if;

  if char_length(v_msg) not between 1 and 1000 then
    raise exception 'Note must be between 1 and 1000 characters.' using errcode = '22023';
  end if;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, message)
  values (v_ticket.id, auth.uid(), 'note', v_msg)
  returning * into v_event;

  if v_profile.role = 'resident' then
    if v_ticket.assigned_to is not null then
      perform public.notify_user(
        v_ticket.assigned_to, v_ticket.id,
        'Resident note: ' || v_ticket.tracking_id, left(v_msg, 300)
      );
    end if;
    for v_admin in select id from public.profiles where role = 'admin' and is_active loop
      perform public.notify_user(
        v_admin.id, v_ticket.id,
        'Resident note: ' || v_ticket.tracking_id, left(v_msg, 300)
      );
    end loop;
  else
    perform public.notify_user(
      v_ticket.resident_id, v_ticket.id,
      'New message: ' || v_ticket.tracking_id, left(v_msg, 300)
    );
  end if;

  return v_event;
end;
$$;

-- Owner confirms a resolved job -> closed, optional rating/feedback.
create or replace function public.resident_confirm_close(
  p_ticket_id uuid,
  p_rating    smallint default null,
  p_feedback  text default null
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_fb     text := nullif(btrim(coalesce(p_feedback, '')), '');
  v_admin  record;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if public.my_role() is distinct from 'resident'
     or v_ticket.resident_id is distinct from auth.uid() then
    raise exception 'Only the resident who reported this issue can close it.'
      using errcode = '42501';
  end if;
  if v_ticket.status <> 'resolved' then
    raise exception 'Only resolved tickets can be confirmed.' using errcode = '22023';
  end if;
  if p_rating is not null and p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_fb, '')) > 1000 then
    raise exception 'Feedback must be 1000 characters or fewer.' using errcode = '22023';
  end if;

  update public.tickets
  set status = 'closed',
      closed_at = now(),
      rating = p_rating,
      feedback = v_fb
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, from_status, to_status, message)
  values (
    v_ticket.id, auth.uid(), 'status_change', 'resolved', 'closed',
    'Resident confirmed the repair and closed the ticket.'
  );

  if p_rating is not null then
    insert into public.ticket_events
      (ticket_id, actor_id, event_type, message)
    values (
      v_ticket.id, auth.uid(), 'rating',
      'Rated ' || p_rating || '/5' || case when v_fb is not null then ' · ' || v_fb else '' end
    );
  end if;

  if v_ticket.assigned_to is not null then
    perform public.notify_user(
      v_ticket.assigned_to, v_ticket.id,
      'Ticket closed: ' || v_ticket.tracking_id,
      'The resident confirmed the repair' ||
        case when p_rating is not null then ' and rated it ' || p_rating || '/5.' else '.' end
    );
  end if;
  for v_admin in select id from public.profiles where role = 'admin' and is_active loop
    perform public.notify_user(
      v_admin.id, v_ticket.id,
      'Ticket closed: ' || v_ticket.tracking_id,
      'The resident confirmed completion' ||
        case when p_rating is not null then ' (rated ' || p_rating || '/5).' else '.' end
    );
  end loop;

  return v_ticket;
end;
$$;

-- Owner rejects a resolution -> reopened (reason required).
create or replace function public.resident_reject(
  p_ticket_id uuid,
  p_reason    text
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_admin  record;
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if public.my_role() is distinct from 'resident'
     or v_ticket.resident_id is distinct from auth.uid() then
    raise exception 'Only the resident who reported this issue can reopen it.'
      using errcode = '42501';
  end if;
  if v_ticket.status <> 'resolved' then
    raise exception 'Only resolved tickets can be rejected.' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Please give a reason between 5 and 500 characters.' using errcode = '22023';
  end if;

  update public.tickets
  set status = 'reopened',
      reopen_count = reopen_count + 1,
      resolved_at = null
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, from_status, to_status, message)
  values (
    v_ticket.id, auth.uid(), 'reopened', 'resolved', 'reopened',
    'Resident reported the issue is not fixed: ' || v_reason
  );

  if v_ticket.assigned_to is not null then
    perform public.notify_user(
      v_ticket.assigned_to, v_ticket.id,
      'Ticket reopened: ' || v_ticket.tracking_id,
      'The resident says the issue is not resolved: ' || left(v_reason, 300)
    );
  end if;
  for v_admin in select id from public.profiles where role = 'admin' and is_active loop
    perform public.notify_user(
      v_admin.id, v_ticket.id,
      'Ticket reopened: ' || v_ticket.tracking_id,
      'Resident rejected the resolution: ' || left(v_reason, 300)
    );
  end loop;

  return v_ticket;
end;
$$;

-- Admin reopens a resolved/closed ticket for a disputed case.
create or replace function public.admin_reopen(
  p_ticket_id uuid,
  p_reason    text
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_old    public.ticket_status;
begin
  if not public.is_admin() then
    raise exception 'Only an active admin can reopen a ticket.' using errcode = '42501';
  end if;

  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if v_ticket.status not in ('resolved', 'closed') then
    raise exception 'Only resolved or closed tickets can be reopened by an admin.'
      using errcode = '22023';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Please give a reason between 5 and 500 characters.' using errcode = '22023';
  end if;

  v_old := v_ticket.status;

  update public.tickets
  set status = 'reopened',
      reopen_count = reopen_count + 1,
      resolved_at = null,
      closed_at = null,
      rating = null,
      feedback = null
  where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, from_status, to_status, message)
  values (
    v_ticket.id, auth.uid(), 'reopened', v_old, 'reopened',
    'Admin reopened the ticket: ' || v_reason
  );

  perform public.notify_user(
    v_ticket.resident_id, v_ticket.id,
    'Ticket reopened: ' || v_ticket.tracking_id,
    'An admin reopened your ticket: ' || left(v_reason, 300)
  );
  if v_ticket.assigned_to is not null then
    perform public.notify_user(
      v_ticket.assigned_to, v_ticket.id,
      'Ticket reopened: ' || v_ticket.tracking_id,
      'An admin reopened this ticket: ' || left(v_reason, 300)
    );
  end if;

  return v_ticket;
end;
$$;

-- Owner attaches photos after creating the ticket (files are uploaded to the
-- ticket's storage folder once the ticket ID exists).
create or replace function public.attach_ticket_photos(
  p_ticket_id  uuid,
  p_photo_paths text[]
)
returns public.tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets;
  v_paths  text[] := coalesce(p_photo_paths, '{}');
  v_path   text;
  v_new    text[];
begin
  select * into v_ticket from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if public.my_role() is distinct from 'resident'
     or v_ticket.resident_id is distinct from auth.uid() then
    raise exception 'Only the resident who reported this issue can add photos.'
      using errcode = '42501';
  end if;
  if v_ticket.status = 'closed' then
    raise exception 'Photos cannot be added to a closed ticket.' using errcode = '22023';
  end if;
  if coalesce(array_length(v_paths, 1), 0) = 0 then
    raise exception 'No photos supplied.' using errcode = '22023';
  end if;
  if coalesce(array_length(v_ticket.photo_paths, 1), 0) + coalesce(array_length(v_paths, 1), 0) > 3 then
    raise exception 'A ticket can have at most 3 photos.' using errcode = '22023';
  end if;

  foreach v_path in array v_paths loop
    if v_path not like v_ticket.id::text || '/%' or position('..' in v_path) > 0 then
      raise exception 'Invalid photo path.' using errcode = '22023';
    end if;
  end loop;

  v_new := v_ticket.photo_paths || v_paths;

  update public.tickets set photo_paths = v_new where id = v_ticket.id
  returning * into v_ticket;

  insert into public.ticket_events
    (ticket_id, actor_id, event_type, message, photo_paths)
  values (
    v_ticket.id, auth.uid(), 'note',
    'Added ' || coalesce(array_length(v_paths, 1), 0) || ' photo(s).', v_paths
  );

  return v_ticket;
end;
$$;

-- Photo references must point to an existing image uploaded by this caller.
-- Old references remain valid when a different participant changes ticket state.
create or replace function public.validate_photo_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text;
  v_ticket_id uuid;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'tickets' then
    v_ticket_id := new.id;
  else
    v_ticket_id := new.ticket_id;
  end if;
  foreach v_path in array new.photo_paths loop
    if tg_op = 'UPDATE' then
      if v_path = any(old.photo_paths) then continue; end if;
    end if;
    if v_path is null or position('..' in v_path) > 0 or not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'ticket-photos' and o.name = v_path
        and o.owner_id = auth.uid()::text
        and split_part(o.name, '/', 1) in (v_ticket_id::text, auth.uid()::text)
    ) then
      raise exception 'Invalid photo reference. Upload your photo to this ticket first.' using errcode = '22023';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists tickets_validate_photos on public.tickets;
create trigger tickets_validate_photos before insert or update of photo_paths on public.tickets
for each row execute function public.validate_photo_references();
drop trigger if exists events_validate_photos on public.ticket_events;
create trigger events_validate_photos before insert on public.ticket_events
for each row execute function public.validate_photo_references();

-- ---------------------------------------------------------------------------
-- 7. Reports
-- ---------------------------------------------------------------------------
create or replace function public.admin_reports(
  p_from date default null,
  p_to   date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can view reports.' using errcode = '42501';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'Start date must be on or before end date.' using errcode = '22023';
  end if;

  with scope as (
    select t.*
    from public.tickets t
    where (p_from is null or t.created_at >= p_from::timestamptz)
      and (p_to is null or t.created_at < (p_to + 1)::timestamptz)
  ),
  status_counts as (
    select status, count(*)::int as count from scope group by status
  ),
  category_counts as (
    select category, count(*)::int as count from scope group by category
  ),
  severity_counts as (
    select severity, count(*)::int as count from scope group by severity
  ),
  block_counts as (
    select block, count(*)::int as count from scope group by block order by count desc
  ),
  assign_events as (
    select t.id, min(e.created_at) as assigned_at
    from scope t
    join public.ticket_events e
      on e.ticket_id = t.id and e.event_type in ('assigned', 'reassigned')
    group by t.id
  ),
  week_bounds as (
    select
      coalesce(date_trunc('week', min(created_at)), date_trunc('week', now())) as mn,
      coalesce(date_trunc('week', max(created_at)), date_trunc('week', now())) as mx
    from scope
  ),
  weeks as (
    select generate_series(mn, mx, interval '1 week') as week from week_bounds
  ),
  week_counts as (
    select w.week::date as week, count(s.id)::int as count
    from weeks w
    left join scope s on date_trunc('week', s.created_at) = w.week
    group by w.week
    order by w.week
  ),
  tech_stats as (
    select
      p.id,
      p.full_name,
      p.specialty,
      p.is_active,
      count(t.id)::int as assigned_count,
      count(t.id) filter (where t.resolved_at is not null)::int as resolved_count,
      round(
        (avg(extract(epoch from (t.resolved_at - t.created_at)) / 3600)
          filter (where t.resolved_at is not null))::numeric, 1
      ) as avg_resolution_hours,
      round((avg(t.rating) filter (where t.rating is not null))::numeric, 2) as avg_rating,
      case
        when count(t.id) = 0 then 0
        else round(
          (count(t.id) filter (where t.reopen_count > 0))::numeric * 100 / count(t.id), 1
        )
      end as reopen_rate
    from public.profiles p
    left join scope t on t.assigned_to = p.id
    where p.role = 'technician'
    group by p.id
  ),
  overdue as (
    select
      t.id, t.tracking_id, t.title, t.status, t.target_date, t.block,
      (current_date - t.target_date)::int as days_overdue,
      p.full_name as technician_name
    from scope t
    left join public.profiles p on p.id = t.assigned_to
    where t.target_date is not null
      and t.target_date < current_date
      and t.status not in ('resolved', 'closed')
    order by t.target_date asc
    limit 50
  ),
  totals as (
    select
      count(*)::int as total,
      count(*) filter (where status not in ('resolved', 'closed'))::int as open,
      count(*) filter (
        where status in ('reported', 'reopened') and assigned_to is null
      )::int as unassigned,
      count(*) filter (
        where target_date < current_date and status not in ('resolved', 'closed')
      )::int as overdue,
      round(
        (avg(extract(epoch from (resolved_at - created_at)) / 3600)
          filter (where resolved_at is not null))::numeric, 1
      ) as avg_resolution_hours,
      round(
        (avg(extract(epoch from (ae.assigned_at - s.created_at)) / 3600)
          filter (where ae.assigned_at is not null))::numeric, 1
      ) as avg_assign_hours
    from scope s
    left join assign_events ae on ae.id = s.id
  )
  select jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'totals', (select to_jsonb(x) from totals x),
    'by_status', coalesce((
      select jsonb_agg(jsonb_build_object('key', status, 'count', count) order by count desc)
      from status_counts
    ), '[]'::jsonb),
    'by_category', coalesce((
      select jsonb_agg(jsonb_build_object('key', category, 'count', count) order by count desc)
      from category_counts
    ), '[]'::jsonb),
    'by_severity', coalesce((
      select jsonb_agg(jsonb_build_object('key', severity, 'count', count) order by count desc)
      from severity_counts
    ), '[]'::jsonb),
    'by_block', coalesce((
      select jsonb_agg(jsonb_build_object('key', block, 'count', count) order by count desc)
      from block_counts
    ), '[]'::jsonb),
    'per_week', coalesce((
      select jsonb_agg(jsonb_build_object('week', week, 'count', count) order by week)
      from week_counts
    ), '[]'::jsonb),
    'technicians', coalesce((
      select jsonb_agg(to_jsonb(ts) order by ts.resolved_count desc, ts.full_name)
      from tech_stats ts
    ), '[]'::jsonb),
    'overdue', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.target_date)
      from overdue o
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Workload helper for the admin assignment modal. security_invoker means the
-- caller's RLS applies (admins see all; others see their own slice).
create or replace view public.technician_workload
with (security_invoker = true)
as
select
  p.id,
  p.full_name,
  p.specialty,
  p.is_active,
  count(t.id) filter (
    where t.status not in ('resolved', 'closed')
  )::int as open_tickets
from public.profiles p
left join public.tickets t on t.assigned_to = p.id
where p.role = 'technician'
group by p.id, p.full_name, p.specialty, p.is_active;

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.tickets       enable row level security;
alter table public.ticket_events enable row level security;
alter table public.notifications enable row level security;

-- Profiles ------------------------------------------------------------------
drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible"
  on public.profiles for select
  to authenticated
  using (public.can_view_profile(id));

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (public.my_role() is not null and (id = auth.uid() or public.is_admin()))
  with check (public.my_role() is not null and (id = auth.uid() or public.is_admin()));

-- Tickets: read-only to clients. All writes go through SECURITY DEFINER RPCs.
drop policy if exists "tickets_select_visible" on public.tickets;
create policy "tickets_select_visible"
  on public.tickets for select
  to authenticated
  using (public.can_access_ticket(id));

-- Ticket events: read-only, immutable audit log.
drop policy if exists "ticket_events_select_visible" on public.ticket_events;
create policy "ticket_events_select_visible"
  on public.ticket_events for select
  to authenticated
  using (public.can_access_ticket(ticket_id));

-- Notifications: users see and mark read only their own.
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (public.my_role() is not null and user_id = auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (public.my_role() is not null and user_id = auth.uid())
  with check (public.my_role() is not null and user_id = auth.uid());

revoke all on public.profiles, public.tickets, public.ticket_events, public.notifications from public, anon;

-- Defence in depth: even if a policy were added by mistake, clients cannot
-- mutate these tables directly.
revoke insert, update, delete on public.tickets from anon, authenticated;
revoke insert, update, delete on public.ticket_events from anon, authenticated;
revoke insert, delete on public.notifications from anon, authenticated;
revoke insert, delete on public.profiles from anon, authenticated;

grant select on public.profiles, public.tickets, public.ticket_events, public.notifications to authenticated;
grant update on public.profiles to authenticated;
revoke update on public.notifications from public, anon, authenticated;
grant update (is_read) on public.notifications to authenticated;

-- Function execution privileges
revoke all on function public.create_ticket(text, text, text, text, public.ticket_category, public.ticket_severity, text, text, text[]) from public, anon;
revoke all on function public.assign_ticket(uuid, uuid, date) from public, anon;
revoke all on function public.technician_update_status(uuid, public.ticket_status, text, text, text[]) from public, anon;
revoke all on function public.add_work_log(uuid, text, text, text[]) from public, anon;
revoke all on function public.add_ticket_note(uuid, text) from public, anon;
revoke all on function public.resident_confirm_close(uuid, smallint, text) from public, anon;
revoke all on function public.resident_reject(uuid, text) from public, anon;
revoke all on function public.admin_reopen(uuid, text) from public, anon;
revoke all on function public.attach_ticket_photos(uuid, text[]) from public, anon;
revoke all on function public.admin_reports(date, date) from public, anon;

grant execute on function public.create_ticket(text, text, text, text, public.ticket_category, public.ticket_severity, text, text, text[]) to authenticated;
grant execute on function public.assign_ticket(uuid, uuid, date) to authenticated;
grant execute on function public.technician_update_status(uuid, public.ticket_status, text, text, text[]) to authenticated;
grant execute on function public.add_work_log(uuid, text, text, text[]) to authenticated;
grant execute on function public.add_ticket_note(uuid, text) to authenticated;
grant execute on function public.resident_confirm_close(uuid, smallint, text) to authenticated;
grant execute on function public.resident_reject(uuid, text) to authenticated;
grant execute on function public.admin_reopen(uuid, text) to authenticated;
grant execute on function public.attach_ticket_photos(uuid, text[]) to authenticated;
grant execute on function public.admin_reports(date, date) to authenticated;

grant select on public.technician_workload to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Storage: private ticket-photos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ticket-photos',
  'ticket-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Paths are `{ticket_id}/{uuid}.jpg` (or `{user_id}/...` for pre-ticket uploads).
drop policy if exists "ticket_photos_select" on storage.objects;
create policy "ticket_photos_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'ticket-photos'
    and public.my_role() is not null
    and (
      public.is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
      or (
        public.is_uuid(split_part(name, '/', 1))
        and public.can_access_ticket(
          case when public.is_uuid(split_part(name, '/', 1))
               then split_part(name, '/', 1)::uuid
               else null end
        )
      )
    )
  );

drop policy if exists "ticket_photos_insert" on storage.objects;
create policy "ticket_photos_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'ticket-photos'
    and public.my_role() is not null
    and (
      split_part(name, '/', 1) = auth.uid()::text
      or (
        public.is_uuid(split_part(name, '/', 1))
        and public.can_access_ticket(
          case when public.is_uuid(split_part(name, '/', 1))
               then split_part(name, '/', 1)::uuid
               else null end
        )
      )
    )
  );

-- Published audit photos cannot be overwritten or deleted by clients.
create or replace function public.photo_is_referenced(p_path text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.tickets where p_path = any(photo_paths))
      or exists (select 1 from public.ticket_events where p_path = any(photo_paths))
$$;

revoke all on function public.photo_is_referenced(text) from public, anon;
grant execute on function public.photo_is_referenced(text) to authenticated;

drop policy if exists "ticket_photos_update" on storage.objects;
drop policy if exists "ticket_photos_delete" on storage.objects;
create policy "ticket_photos_delete" on storage.objects for delete to authenticated
using (bucket_id = 'ticket-photos' and public.my_role() is not null
  and owner_id = auth.uid()::text and not public.photo_is_referenced(name));

-- ---------------------------------------------------------------------------
-- 10. Realtime
-- ---------------------------------------------------------------------------
alter table public.tickets replica identity full;
alter table public.ticket_events replica identity full;
alter table public.notifications replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'ticket_events'
  ) then
    alter publication supabase_realtime add table public.ticket_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Done.
