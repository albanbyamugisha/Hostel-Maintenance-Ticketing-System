-- ============================================================================
-- HostelCare — optional demo seed
--
-- Creates 1 admin, 2 technicians and 3 residents, plus 15 tickets covering
-- every status and a matching audit trail. Safe to re-run (fixed IDs and
-- ON CONFLICT DO NOTHING).
--
-- Demo password for every account:  HostelDemo#2026
--
-- Accounts:
--   admin@hostel.test      Amina Warden (admin)
--   tech.plumb@hostel.test Daniel Mwangi (technician, plumbing)
--   tech.elec@hostel.test  Grace Otieno (technician, electrical)
--   resident1@hostel.test  Brian Kimani (resident, Block A)
--   resident2@hostel.test  Faith Njeri  (resident, Block B)
--   resident3@hostel.test  Kevin Ouma   (resident, Block C)
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Auth users + profiles
-- ---------------------------------------------------------------------------
do $$
declare
  u record;
  v_password text := 'HostelDemo#2026';
begin
  for u in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'admin@hostel.test',
       'Amina Warden', '+254700000001', null::text, null::text),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'tech.plumb@hostel.test',
       'Daniel Mwangi', '+254700000002', null::text, null::text),
      ('33333333-3333-4333-8333-333333333333'::uuid, 'tech.elec@hostel.test',
       'Grace Otieno', '+254700000003', null::text, null::text),
      ('44444444-4444-4444-8444-444444444444'::uuid, 'resident1@hostel.test',
       'Brian Kimani', '+254700000004', 'Block A', '201'),
      ('55555555-5555-4555-8555-555555555555'::uuid, 'resident2@hostel.test',
       'Faith Njeri', '+254700000005', 'Block B', '108'),
      ('66666666-6666-4666-8666-666666666666'::uuid, 'resident3@hostel.test',
       'Kevin Ouma', '+254700000006', 'Block C', '312')
    ) as t(id, email, full_name, phone, block, room_number)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      u.id,
      'authenticated',
      'authenticated',
      u.email,
      crypt(v_password, gen_salt('bf')),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'full_name', u.full_name,
        'phone', u.phone,
        'block', coalesce(u.block, ''),
        'room_number', coalesce(u.room_number, '')
      ),
      now(), now(), '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      u.id,
      u.id::text,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    )
    on conflict do nothing;
  end loop;
end $$;

-- The auth trigger creates residents; promote/set details here. auth.uid() is
-- null in the SQL editor, so the profile guard permits these trusted changes.
update public.profiles set
  full_name = 'Amina Warden', phone = '+254700000001', role = 'admin',
  specialty = null, block = null, room_number = null, is_active = true
where id = '11111111-1111-4111-8111-111111111111';

update public.profiles set
  full_name = 'Daniel Mwangi', phone = '+254700000002', role = 'technician',
  specialty = 'plumbing', block = null, room_number = null, is_active = true
where id = '22222222-2222-4222-8222-222222222222';

update public.profiles set
  full_name = 'Grace Otieno', phone = '+254700000003', role = 'technician',
  specialty = 'electrical', block = null, room_number = null, is_active = true
where id = '33333333-3333-4333-8333-333333333333';

update public.profiles set
  full_name = 'Brian Kimani', phone = '+254700000004', role = 'resident',
  specialty = null, block = 'Block A', room_number = '201', is_active = true
where id = '44444444-4444-4444-8444-444444444444';

update public.profiles set
  full_name = 'Faith Njeri', phone = '+254700000005', role = 'resident',
  specialty = null, block = 'Block B', room_number = '108', is_active = true
where id = '55555555-5555-4555-8555-555555555555';

update public.profiles set
  full_name = 'Kevin Ouma', phone = '+254700000006', role = 'resident',
  specialty = null, block = 'Block C', room_number = '312', is_active = true
where id = '66666666-6666-4666-8666-666666666666';

-- ---------------------------------------------------------------------------
-- Tickets
-- ---------------------------------------------------------------------------
insert into public.tickets (
  id, tracking_id, resident_id, block, floor, room_number, location_type,
  category, severity, title, description, status,
  assigned_to, assigned_by, target_date, hold_reason,
  resolved_at, closed_at, rating, feedback, reopen_count,
  created_at, updated_at
)
values
  -- 1. Reported, emergency, unassigned
  ('a0000000-0000-4000-8000-000000000001', 'HMT-2026-000001',
   '44444444-4444-4444-8444-444444444444', 'Block A', '2', '201', 'room',
   'electrical', 'emergency', 'Sparking socket near study desk',
   'The wall socket beside the study desk sparks and smells burnt whenever I plug in my laptop charger. I have stopped using it.',
   'reported', null, null, null, null, null, null, null, null, 0,
   now() - interval '2 hours', now() - interval '2 hours'),

  -- 2. Reported, low, unassigned
  ('a0000000-0000-4000-8000-000000000002', 'HMT-2026-000002',
   '55555555-5555-4555-8555-555555555555', 'Block B', '1', '108', 'room',
   'plumbing', 'low', 'Dripping tap in shared kitchen',
   'The cold tap in the second-floor shared kitchen drips constantly and the sink is slowly filling overnight.',
   'reported', null, null, null, null, null, null, null, null, 0,
   now() - interval '1 day', now() - interval '1 day'),

  -- 3. Reported, medium, unassigned
  ('a0000000-0000-4000-8000-000000000003', 'HMT-2026-000003',
   '66666666-6666-4666-8666-666666666666', 'Block C', '3', '312', 'room',
   'carpentry_structure', 'medium', 'Wardrobe door hinge broken',
   'The lower hinge on my wardrobe door has snapped. The door hangs at an angle and will not close properly.',
   'reported', null, null, null, null, null, null, null, null, 0,
   now() - interval '3 days', now() - interval '3 days'),

  -- 4. Assigned, high
  ('a0000000-0000-4000-8000-000000000004', 'HMT-2026-000004',
   '44444444-4444-4444-8444-444444444444', 'Block A', '2', '201', 'room',
   'plumbing', 'high', 'Leaking pipe under bathroom sink',
   'Water is pooling under the bathroom sink and the cabinet floor is soaked. The leak appears to come from the trap joint.',
   'assigned',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   current_date + 2, null, null, null, null, null, 0,
   now() - interval '2 days', now() - interval '1 day'),

  -- 5. Assigned, overdue
  ('a0000000-0000-4000-8000-000000000005', 'HMT-2026-000005',
   '55555555-5555-4555-8555-555555555555', 'Block B', '1', '108', 'room',
   'electrical', 'medium', 'Bedside light switch faulty',
   'The bedside light switch only works intermittently and sometimes trips the room circuit when switched on.',
   'assigned',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   current_date - 2, null, null, null, null, null, 0,
   now() - interval '6 days', now() - interval '5 days'),

  -- 6. In progress, high
  ('a0000000-0000-4000-8000-000000000006', 'HMT-2026-000006',
   '66666666-6666-4666-8666-666666666666', 'Block C', '3', '312', 'room',
   'carpentry_structure', 'high', 'Broken window latch (security risk)',
   'The window latch in my room is broken and the window cannot be locked. I am on the ground-floor side of the block.',
   'in_progress',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   current_date + 1, null, null, null, null, null, 0,
   now() - interval '4 days', now() - interval '1 day'),

  -- 7. In progress, emergency
  ('a0000000-0000-4000-8000-000000000007', 'HMT-2026-000007',
   '44444444-4444-4444-8444-444444444444', 'Block A', '2', '201', 'room',
   'electrical', 'emergency', 'Distribution board buzzing loudly',
   'The distribution board in the corridor outside room 201 is buzzing loudly and the lights flicker. It feels hot to the touch.',
   'in_progress',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   current_date, null, null, null, null, null, 0,
   now() - interval '1 day', now() - interval '4 hours'),

  -- 8. On hold, medium
  ('a0000000-0000-4000-8000-000000000008', 'HMT-2026-000008',
   '55555555-5555-4555-8555-555555555555', 'Block B', '1', '108', 'room',
   'plumbing', 'medium', 'Shower mixer stuck on hot',
   'The shower mixer will not turn back to cold. The water is dangerously hot and I cannot shower safely.',
   'on_hold',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   current_date + 3, 'Waiting for the replacement mixer valve to be delivered by the supplier.',
   null, null, null, null, 0,
   now() - interval '8 days', now() - interval '2 days'),

  -- 9. On hold, low
  ('a0000000-0000-4000-8000-000000000009', 'HMT-2026-000009',
   '66666666-6666-4666-8666-666666666666', 'Block C', '3', '312', 'common_area',
   'carpentry_structure', 'low', 'Loose skirting board in corridor',
   'A section of skirting board outside room 312 has come loose and is a trip hazard in the corridor.',
   'on_hold',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   current_date + 5, 'Needs warden approval before replacing the full section of skirting.',
   null, null, null, null, 0,
   now() - interval '9 days', now() - interval '3 days'),

  -- 10. Resolved, awaiting resident confirmation
  ('a0000000-0000-4000-8000-000000000010', 'HMT-2026-000010',
   '44444444-4444-4444-8444-444444444444', 'Block A', '2', '201', 'room',
   'electrical', 'high', 'Socket outlet burnt out',
   'The socket next to my bed has black scorch marks and no longer works. I am using the other side of the room for now.',
   'resolved',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   current_date - 1, null, now() - interval '1 day', null, null, null, 0,
   now() - interval '12 days', now() - interval '1 day'),

  -- 11. Resolved, awaiting resident confirmation
  ('a0000000-0000-4000-8000-000000000011', 'HMT-2026-000011',
   '55555555-5555-4555-8555-555555555555', 'Block B', '1', '108', 'room',
   'plumbing', 'low', 'Slow drain in bathroom sink',
   'The bathroom sink drains very slowly and leaves a ring of dirty water. I have tried using a plunger without success.',
   'resolved',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   current_date + 1, null, now() - interval '2 days', null, null, null, 0,
   now() - interval '5 days', now() - interval '2 days'),

  -- 12. Closed with rating
  ('a0000000-0000-4000-8000-000000000012', 'HMT-2026-000012',
   '66666666-6666-4666-8666-666666666666', 'Block C', '3', '312', 'room',
   'carpentry_structure', 'medium', 'Desk drawer runner broken',
   'The metal runner on the top desk drawer has come apart, so the drawer falls out when opened.',
   'closed',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   current_date - 5, null, now() - interval '15 days', now() - interval '14 days',
   5, 'Quick and tidy work. The drawer now slides smoothly.', 0,
   now() - interval '20 days', now() - interval '14 days'),

  -- 13. Closed with rating
  ('a0000000-0000-4000-8000-000000000013', 'HMT-2026-000013',
   '44444444-4444-4444-8444-444444444444', 'Block A', '2', '201', 'room',
   'electrical', 'low', 'Ceiling light flickers',
   'The ceiling light flickers for a few minutes after being switched on, then stays on. The bulb was replaced recently.',
   'closed',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   current_date - 8, null, now() - interval '20 days', now() - interval '19 days',
   4, 'Fixed the loose connection. Took a little while to arrange access but works fine now.', 0,
   now() - interval '25 days', now() - interval '19 days'),

  -- 14. Reopened once
  ('a0000000-0000-4000-8000-000000000014', 'HMT-2026-000014',
   '55555555-5555-4555-8555-555555555555', 'Block B', '1', '108', 'room',
   'plumbing', 'high', 'Toilet cistern constantly running',
   'The cistern keeps refilling every few minutes and water is running into the pan. It is wasting a lot of water at night.',
   'reopened',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   current_date + 2, null, null, null, null, null, 1,
   now() - interval '15 days', now() - interval '9 days'),

  -- 15. Reopened twice
  ('a0000000-0000-4000-8000-000000000015', 'HMT-2026-000015',
   '66666666-6666-4666-8666-666666666666', 'Block C', '3', '312', 'room',
   'carpentry_structure', 'medium', 'Door lock jammed',
   'My room door lock jams when I turn the key and twice I have been stuck outside for several minutes.',
   'reopened',
   '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111',
   current_date + 4, null, null, null, null, null, 2,
   now() - interval '30 days', now() - interval '14 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
insert into public.ticket_events
  (id, ticket_id, actor_id, event_type, from_status, to_status, message, parts_used, created_at)
values
  -- T1
  ('e0000000-0000-4000-8000-000000000101', 'a0000000-0000-4000-8000-000000000001',
   '44444444-4444-4444-8444-444444444444', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '2 hours'),
  -- T2
  ('e0000000-0000-4000-8000-000000000102', 'a0000000-0000-4000-8000-000000000002',
   '55555555-5555-4555-8555-555555555555', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '1 day'),
  -- T3
  ('e0000000-0000-4000-8000-000000000103', 'a0000000-0000-4000-8000-000000000003',
   '66666666-6666-4666-8666-666666666666', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '3 days'),

  -- T4
  ('e0000000-0000-4000-8000-000000000104', 'a0000000-0000-4000-8000-000000000004',
   '44444444-4444-4444-8444-444444444444', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '2 days'),
  ('e0000000-0000-4000-8000-000000000105', 'a0000000-0000-4000-8000-000000000004',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Daniel Mwangi.', null, now() - interval '1 day'),

  -- T5
  ('e0000000-0000-4000-8000-000000000106', 'a0000000-0000-4000-8000-000000000005',
   '55555555-5555-4555-8555-555555555555', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '6 days'),
  ('e0000000-0000-4000-8000-000000000107', 'a0000000-0000-4000-8000-000000000005',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '5 days'),

  -- T6
  ('e0000000-0000-4000-8000-000000000108', 'a0000000-0000-4000-8000-000000000006',
   '66666666-6666-4666-8666-666666666666', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '4 days'),
  ('e0000000-0000-4000-8000-000000000109', 'a0000000-0000-4000-8000-000000000006',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Daniel Mwangi.', null, now() - interval '3 days'),
  ('e0000000-0000-4000-8000-000000000110', 'a0000000-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', 'status_change', 'assigned', 'in_progress',
   'Inspected the window; the latch mechanism has failed and the frame needs a small repair.', null,
   now() - interval '1 day'),

  -- T7
  ('e0000000-0000-4000-8000-000000000111', 'a0000000-0000-4000-8000-000000000007',
   '44444444-4444-4444-8444-444444444444', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '1 day'),
  ('e0000000-0000-4000-8000-000000000112', 'a0000000-0000-4000-8000-000000000007',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '20 hours'),
  ('e0000000-0000-4000-8000-000000000113', 'a0000000-0000-4000-8000-000000000007',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'assigned', 'in_progress',
   'Isolated the affected circuit and started testing the board connections.', null,
   now() - interval '4 hours'),

  -- T8
  ('e0000000-0000-4000-8000-000000000114', 'a0000000-0000-4000-8000-000000000008',
   '55555555-5555-4555-8555-555555555555', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '8 days'),
  ('e0000000-0000-4000-8000-000000000115', 'a0000000-0000-4000-8000-000000000008',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Daniel Mwangi.', null, now() - interval '7 days'),
  ('e0000000-0000-4000-8000-000000000116', 'a0000000-0000-4000-8000-000000000008',
   '22222222-2222-4222-8222-222222222222', 'status_change', 'assigned', 'in_progress',
   'Drained the line and removed the mixer cartridge for inspection.', null,
   now() - interval '6 days'),
  ('e0000000-0000-4000-8000-000000000117', 'a0000000-0000-4000-8000-000000000008',
   '22222222-2222-4222-8222-222222222222', 'status_change', 'in_progress', 'on_hold',
   'Waiting for the replacement mixer valve to be delivered by the supplier.', null,
   now() - interval '2 days'),

  -- T9
  ('e0000000-0000-4000-8000-000000000118', 'a0000000-0000-4000-8000-000000000009',
   '66666666-6666-4666-8666-666666666666', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '9 days'),
  ('e0000000-0000-4000-8000-000000000119', 'a0000000-0000-4000-8000-000000000009',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '8 days'),
  ('e0000000-0000-4000-8000-000000000120', 'a0000000-0000-4000-8000-000000000009',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'assigned', 'in_progress',
   'Temporarily secured the loose board and measured the replacement section.', null,
   now() - interval '7 days'),
  ('e0000000-0000-4000-8000-000000000121', 'a0000000-0000-4000-8000-000000000009',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'in_progress', 'on_hold',
   'Needs warden approval before replacing the full section of skirting.', null,
   now() - interval '3 days'),

  -- T10
  ('e0000000-0000-4000-8000-000000000122', 'a0000000-0000-4000-8000-000000000010',
   '44444444-4444-4444-8444-444444444444', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '12 days'),
  ('e0000000-0000-4000-8000-000000000123', 'a0000000-0000-4000-8000-000000000010',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '11 days'),
  ('e0000000-0000-4000-8000-000000000124', 'a0000000-0000-4000-8000-000000000010',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'assigned', 'in_progress',
   'Switched off the circuit and opened the outlet for inspection.', null,
   now() - interval '9 days'),
  ('e0000000-0000-4000-8000-000000000125', 'a0000000-0000-4000-8000-000000000010',
   '33333333-3333-4333-8333-333333333333', 'work_log', 'in_progress', 'resolved',
   'Replaced the damaged socket outlet and checked the adjacent wiring. Circuit tested and left safe.',
   '1x 13A double socket outlet, 2m 2.5mm cable', now() - interval '1 day'),

  -- T11
  ('e0000000-0000-4000-8000-000000000126', 'a0000000-0000-4000-8000-000000000011',
   '55555555-5555-4555-8555-555555555555', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '5 days'),
  ('e0000000-0000-4000-8000-000000000127', 'a0000000-0000-4000-8000-000000000011',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Daniel Mwangi.', null, now() - interval '4 days'),
  ('e0000000-0000-4000-8000-000000000128', 'a0000000-0000-4000-8000-000000000011',
   '22222222-2222-4222-8222-222222222222', 'status_change', 'assigned', 'in_progress',
   'Removed the trap and cleared the blockage.', null, now() - interval '3 days'),
  ('e0000000-0000-4000-8000-000000000129', 'a0000000-0000-4000-8000-000000000011',
   '22222222-2222-4222-8222-222222222222', 'work_log', 'in_progress', 'resolved',
   'Cleared hair and soap build-up from the trap, flushed the line and tested drainage.',
   'None', now() - interval '2 days'),

  -- T12
  ('e0000000-0000-4000-8000-000000000130', 'a0000000-0000-4000-8000-000000000012',
   '66666666-6666-4666-8666-666666666666', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '20 days'),
  ('e0000000-0000-4000-8000-000000000131', 'a0000000-0000-4000-8000-000000000012',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Daniel Mwangi.', null, now() - interval '19 days'),
  ('e0000000-0000-4000-8000-000000000132', 'a0000000-0000-4000-8000-000000000012',
   '22222222-2222-4222-8222-222222222222', 'status_change', 'assigned', 'in_progress',
   'Measured the drawer and removed the broken runner.', null, now() - interval '17 days'),
  ('e0000000-0000-4000-8000-000000000133', 'a0000000-0000-4000-8000-000000000012',
   '22222222-2222-4222-8222-222222222222', 'work_log', 'in_progress', 'resolved',
   'Fitted a new pair of drawer runners and adjusted the drawer alignment.',
   '1 pair 400mm drawer runners, 8 screws', now() - interval '15 days'),
  ('e0000000-0000-4000-8000-000000000134', 'a0000000-0000-4000-8000-000000000012',
   '66666666-6666-4666-8666-666666666666', 'status_change', 'resolved', 'closed',
   'Resident confirmed the repair and closed the ticket.', null, now() - interval '14 days'),
  ('e0000000-0000-4000-8000-000000000135', 'a0000000-0000-4000-8000-000000000012',
   '66666666-6666-4666-8666-666666666666', 'rating', null, null,
   'Rated 5/5 · Quick and tidy work. The drawer now slides smoothly.', null,
   now() - interval '14 days'),

  -- T13
  ('e0000000-0000-4000-8000-000000000136', 'a0000000-0000-4000-8000-000000000013',
   '44444444-4444-4444-8444-444444444444', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '25 days'),
  ('e0000000-0000-4000-8000-000000000137', 'a0000000-0000-4000-8000-000000000013',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '24 days'),
  ('e0000000-0000-4000-8000-000000000138', 'a0000000-0000-4000-8000-000000000013',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'assigned', 'in_progress',
   'Tested the fitting and found a loose neutral connection.', null, now() - interval '22 days'),
  ('e0000000-0000-4000-8000-000000000139', 'a0000000-0000-4000-8000-000000000013',
   '33333333-3333-4333-8333-333333333333', 'work_log', 'in_progress', 'resolved',
   'Tightened the neutral connection, replaced the lamp holder and tested for 20 minutes.',
   '1x lamp holder', now() - interval '20 days'),
  ('e0000000-0000-4000-8000-000000000140', 'a0000000-0000-4000-8000-000000000013',
   '44444444-4444-4444-8444-444444444444', 'status_change', 'resolved', 'closed',
   'Resident confirmed the repair and closed the ticket.', null, now() - interval '19 days'),
  ('e0000000-0000-4000-8000-000000000141', 'a0000000-0000-4000-8000-000000000013',
   '44444444-4444-4444-8444-444444444444', 'rating', null, null,
   'Rated 4/5 · Fixed the loose connection. Took a little while to arrange access but works fine now.', null,
   now() - interval '19 days'),

  -- T14
  ('e0000000-0000-4000-8000-000000000142', 'a0000000-0000-4000-8000-000000000014',
   '55555555-5555-4555-8555-555555555555', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '15 days'),
  ('e0000000-0000-4000-8000-000000000143', 'a0000000-0000-4000-8000-000000000014',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Daniel Mwangi.', null, now() - interval '14 days'),
  ('e0000000-0000-4000-8000-000000000144', 'a0000000-0000-4000-8000-000000000014',
   '22222222-2222-4222-8222-222222222222', 'status_change', 'assigned', 'in_progress',
   'Opened the cistern and checked the inlet valve.', null, now() - interval '12 days'),
  ('e0000000-0000-4000-8000-000000000145', 'a0000000-0000-4000-8000-000000000014',
   '22222222-2222-4222-8222-222222222222', 'work_log', 'in_progress', 'resolved',
   'Replaced the inlet washer and adjusted the float height. Refill cycle tested twice.',
   '1x inlet valve washer', now() - interval '10 days'),
  ('e0000000-0000-4000-8000-000000000146', 'a0000000-0000-4000-8000-000000000014',
   '55555555-5555-4555-8555-555555555555', 'reopened', 'resolved', 'reopened',
   'Resident reported the issue is not fixed: It is still running, just more slowly than before.', null,
   now() - interval '9 days'),

  -- T15
  ('e0000000-0000-4000-8000-000000000147', 'a0000000-0000-4000-8000-000000000015',
   '66666666-6666-4666-8666-666666666666', 'created', null, 'reported',
   'Issue reported by resident.', null, now() - interval '30 days'),
  ('e0000000-0000-4000-8000-000000000148', 'a0000000-0000-4000-8000-000000000015',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reported', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '28 days'),
  ('e0000000-0000-4000-8000-000000000149', 'a0000000-0000-4000-8000-000000000015',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'assigned', 'in_progress',
   'Applied lubricant and adjusted the strike plate.', null, now() - interval '25 days'),
  ('e0000000-0000-4000-8000-000000000150', 'a0000000-0000-4000-8000-000000000015',
   '33333333-3333-4333-8333-333333333333', 'work_log', 'in_progress', 'resolved',
   'Cleaned and lubricated the lock mechanism and tested the key ten times.',
   'Graphite lock lubricant', now() - interval '22 days'),
  ('e0000000-0000-4000-8000-000000000151', 'a0000000-0000-4000-8000-000000000015',
   '66666666-6666-4666-8666-666666666666', 'reopened', 'resolved', 'reopened',
   'Resident reported the issue is not fixed: The key still sticks when the door is closed.', null,
   now() - interval '20 days'),
  ('e0000000-0000-4000-8000-000000000152', 'a0000000-0000-4000-8000-000000000015',
   '11111111-1111-4111-8111-111111111111', 'assigned', 'reopened', 'assigned',
   'Assigned to Grace Otieno.', null, now() - interval '18 days'),
  ('e0000000-0000-4000-8000-000000000153', 'a0000000-0000-4000-8000-000000000015',
   '33333333-3333-4333-8333-333333333333', 'status_change', 'assigned', 'in_progress',
   'Removed the lock body to check the internal mechanism.', null, now() - interval '17 days'),
  ('e0000000-0000-4000-8000-000000000154', 'a0000000-0000-4000-8000-000000000015',
   '33333333-3333-4333-8333-333333333333', 'work_log', 'in_progress', 'resolved',
   'Replaced the internal latch spring and realigned the lock body.',
   '1x lock latch spring', now() - interval '15 days'),
  ('e0000000-0000-4000-8000-000000000155', 'a0000000-0000-4000-8000-000000000015',
   '66666666-6666-4666-8666-666666666666', 'reopened', 'resolved', 'reopened',
   'Resident reported the issue is not fixed: It worked for two days but has started jamming again.', null,
   now() - interval '14 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- A few notifications (mix of read/unread)
-- ---------------------------------------------------------------------------
insert into public.notifications (id, user_id, ticket_id, title, body, is_read, created_at)
values
  ('f0000000-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001',
   'EMERGENCY reported: HMT-2026-000001',
   'Sparking socket near study desk · Block A / 201 · Emergency',
   false, now() - interval '2 hours'),
  ('f0000000-0000-4000-8000-000000000002',
   '22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000004',
   'New job assigned: HMT-2026-000004',
   'Leaking pipe under bathroom sink · Block A / 201 · due soon',
   false, now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000003',
   '44444444-4444-4444-8444-444444444444', 'a0000000-0000-4000-8000-000000000004',
   'Your ticket is assigned: HMT-2026-000004',
   'A technician (Daniel Mwangi) has been assigned to your repair.',
   true, now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000004',
   '44444444-4444-4444-8444-444444444444', 'a0000000-0000-4000-8000-000000000010',
   'Work completed: HMT-2026-000010',
   'The maintenance work has been finished. Please confirm and close the ticket, or reject it if the issue is not fixed.',
   false, now() - interval '1 day'),
  ('f0000000-0000-4000-8000-000000000005',
   '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000014',
   'Ticket reopened: HMT-2026-000014',
   'Resident rejected the resolution: It is still running, just more slowly than before.',
   true, now() - interval '9 days'),
  ('f0000000-0000-4000-8000-000000000006',
   '33333333-3333-4333-8333-333333333333', 'a0000000-0000-4000-8000-000000000007',
   'New job assigned: HMT-2026-000007',
   'Distribution board buzzing loudly · Block A / 201',
   false, now() - interval '20 hours')
on conflict (id) do nothing;

-- Keep generated tracking IDs after the seeded range.
select setval(
  'public.ticket_tracking_seq',
  greatest((select last_value from public.ticket_tracking_seq), 100),
  true
);
