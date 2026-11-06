# HostelCare — Hostel Maintenance Ticketing System

A mobile-first maintenance desk for residents, technicians and hostel administrators. Plain HTML, CSS and JavaScript ES modules; Supabase supplies authentication, PostgreSQL, private photo storage and realtime updates. There is no frontend build step.

## Quick start

1. Create a Supabase project.
2. In its SQL editor, run **`supabase/schema.sql`** as the database owner. It creates the tables, role guards, ticket RPCs, RLS, private `ticket-photos` bucket, storage policies and realtime publication entries. The file can be rerun on this schema; it is not a migration tool for unrelated existing schemas.
3. Optionally run **`supabase/seed.sql`** in a development project. It adds six demo accounts and 15 tickets covering every status. Do not seed a live production project with these public passwords.
4. Edit **`js/config.js`** using `js/config.example.js` as the template:

   ```js
   export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
   export const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
   ```

   Use the project's **anon/public** browser key. Never put a service-role key, secret key, database password or connection string in these files. The public key is meant to be visible; RLS and RPC authorization protect the data.
5. From this folder, start a static server:

   ```sh
   python3 -m http.server 8080 --bind 127.0.0.1
   ```

   Alternatively use `python -m http.server 8080` or, with Node/npm installed, `npx serve .`.
6. Open [http://localhost:8080](http://localhost:8080). Before configuration, the app displays the setup guide.

A modern browser with ES modules, top-level await and canvas support is required. Supabase JS v2 and Chart.js load from jsDelivr, so the first connected use requires internet access. No Node installation is needed to serve the app with Python.

## Authentication settings and the first administrator

Set your local origin and final deployed origin in Supabase Auth's URL configuration. Allow redirects to your application path, including the password recovery URL, e.g. `http://localhost:8080/?recovery=1`. For a subfolder deployment, include the subfolder. Configure production email delivery and choose whether email confirmation is required. Registration always creates a resident, regardless of supplied signup metadata.

Without the demo seed, register your own account, confirm your email if required, then run this in the SQL editor:

```sql
update public.profiles
set role = 'admin', is_active = true
where id = (
  select id from auth.users where email = 'you@example.com'
);
```

Sign out and back in after promotion. Administrators can then promote registered residents to technicians or administrators from **People**. A technician must have a specialty. Administrators cannot demote or deactivate their own account. Deactivation blocks database access even if an old authentication token is still valid.

Password recovery uses PKCE. Open the reset email in the browser that requested it, and allow the recovery redirect URL in Supabase. The Profile page also supports password changes for signed-in users.

## Demo accounts

All demo accounts use **`HostelDemo#2026`**.

| Email | Role | Specialty |
| --- | --- | --- |
| admin@hostel.test | Admin | — |
| tech.plumb@hostel.test | Technician | Plumbing |
| tech.elec@hostel.test | Technician | Electrical |
| resident1@hostel.test | Resident | — |
| resident2@hostel.test | Resident | — |
| resident3@hostel.test | Resident | — |

The optional seed writes Supabase Auth tables directly as the trusted SQL editor user. It is intended for a fresh development project. It has stable IDs and can be rerun without duplicating tickets/events. It updates demo profile roles and details on each run. Never reuse these identities for real users.

## Screens

- **Resident:** dashboard, issue reporting, searchable/status-filtered tickets, detail and timeline, confirmation/rating and rejection.
- **Technician:** priority-sorted jobs, target dates and overdue indicators, start/resume, hold, resolve, work logs, parts and completion photos.
- **Admin:** triage, assignment/reassignment with workload and specialty hints, filtered and paginated ticket register, CSV export, people management, reports and disputed-ticket reopening.
- **Shared:** notifications, profile/password settings, theme preferences, offline/error states and role guards.

Reports default to the last 90 days, based on ticket creation dates. They show status/category/severity/block counts, weekly demand, assignment and resolution time, technician performance and overdue jobs. Resolution duration is measured from reporting to the latest resolution; technician metrics attribute a ticket to its current assignee. The overdue report lists the first 50 overdue jobs; the ticket register supports the full overdue filter and export.

## Ticket lifecycle and authorization

| Actor | Allowed operation |
| --- | --- |
| Resident | Create a ticket as `reported`; read their own tickets; add notes/photos; from `resolved`, confirm to `closed` with optional 1–5 rating and feedback, or reject with a 5–500 character reason to `reopened` |
| Assigned technician | `assigned → in_progress`; `in_progress → on_hold` with a 3–500 character reason; `on_hold → in_progress`; `in_progress → resolved` with a 10–2000 character work log; `reopened → in_progress`; add work logs, parts and photos |
| Admin | Read all tickets; assign/reassign from `reported`, `assigned` or `reopened`; reopen `resolved` or `closed` with a reason; manage users and view reports |

Every ticket mutation uses a security-definer RPC that checks the caller and writes audit events in the same database transaction. Row locks serialize state transitions. Client INSERT/UPDATE/DELETE privileges on tickets and events are revoked. Audit events cannot be edited or deleted by application users; the trusted database owner remains able to administer the database. Invalid transitions fail even when the frontend is bypassed.

Ticket creation notifies active admins, with a distinct emergency title. Assignment notifies the technician and resident; holds notify admins; resolution notifies the resident; rejection alerts admins and the technician. Realtime subscriptions update notifications and ticket views. Users may update only `is_read` on their own notifications.

## Photos and storage

The schema creates the **private** `ticket-photos` bucket automatically; no manual bucket creation is required. Its maximum object size is 5 MB, with JPEG/PNG/WebP allowed.

The camera/gallery picker accepts up to three photos. Each original must be at most 5 MB; images are resized on-device to a longest edge of 1280 pixels and encoded as JPEG at quality 0.8. The app creates the ticket, uploads to `{ticket_id}/{uuid}.jpg`, then attaches paths through an RPC. Photos use one-hour signed URLs rather than public bucket links. Refresh a long-open detail page to renew expired links.

Database triggers validate that new photo references identify existing uploads owned by the caller in the correct ticket/user folder. Owners, the assigned technician and admins can view ticket-folder photos. Uploaded objects cannot be overwritten by clients. Photos already attached to tickets or audit events cannot be deleted by clients; failed, unattached uploads can be removed by their uploader. A photo-upload failure does not discard the ticket: the app shows a warning and permits retry from its detail page.

## Responsive design, accessibility and PWA

The shell uses a sidebar at 1024px and above, with bottom navigation on phones. Tables stack into labelled cards on small screens. Theme follows the operating system by default; a manual preference is stored locally. Controls have visible focus states, labelled forms and status text; dialogs trap and restore focus. Emergency severity includes text as well as colour.

The manifest and PNG icons support home-screen installation in supporting browsers. PWA installation and service workers require HTTPS, except on localhost. Install from the browser menu when offered. Service workers do not run from `file://` URLs.

The service worker caches the local app shell. It does **not** cache Supabase responses, authentication data, signed photos, or third-party scripts. Offline changes are not queued: existing rendered data may remain visible, but mutations require a connection. A fresh offline load with configured credentials displays a connection-needed screen if the CDN client cannot load. This avoids implying that an unsent maintenance request was saved. Cache versions are scoped to `hmt-` so unrelated applications' caches are preserved. Change the service worker version when releasing updated shell assets.

## Static hosting

Upload the application files with `index.html` at the site's root (or chosen subfolder). Hash routes need no server-side SPA rewrite. HTTPS is required for production. Add the final origin/path to Supabase Auth redirects before testing registration or recovery.

- **Netlify:** deploy this folder as the publish directory; leave the build command empty.
- **Vercel:** use a static/Other project, no build command, output directory `.`.
- **GitHub Pages:** publish the folder from the chosen branch or upload it as a Pages artifact. Keep all relative asset paths and set Auth redirects to the repository subfolder URL.
- **Cloudflare Pages:** use direct upload, or connect a repository with no build command and this folder as output.

When publishing through Git, `js/config.js` is ignored. Supply the public config file as part of your hosting upload/deployment step. The example remains versioned. A static host does not automatically substitute environment variables into JavaScript files.

## Validation

Run the dependency-free module/link and asset checks with Node 20+:

```sh
node --experimental-vm-modules tests/check.cjs
```

The database regression test uses PGlite with pgcrypto in a disposable in-memory database. It provides small Auth/Storage table fixtures, runs the real schema and seed twice, then checks lifecycle transitions, cross-user access, direct-write denials, audit immutability, notification permissions and inactive accounts. It tests PostgreSQL behavior, not the hosted Supabase Auth/Storage/Realtime services.

To run it without adding application dependencies, install `@electric-sql/pglite` in a temporary directory using npm/pnpm, then point at its module directory:

```sh
npm install --prefix /tmp/hostelcare-checks @electric-sql/pglite
PGLITE_MODULE=/tmp/hostelcare-checks/node_modules/@electric-sql/pglite node tests/database.cjs
```

Browser verification performed during completion covered 22 public and role-specific screens at 320, 375, 768, 1024 and 1440 pixels using mock data. Offline shell reloads, blocked-CDN recovery and form validation were also checked. These checks verify rendering and escaping, not a live backend connection.

Before using real resident data, verify against your Supabase project with three separate browser sessions: register a resident, create a photographed ticket, assign it as admin, start/hold/resume/resolve as technician, reject and resolve again, then confirm with a rating. Verify notifications, photos and reports, and confirm that an unrelated resident cannot fetch the ticket. Hosted email delivery, real Storage uploads, realtime delivery and installation depend on that project's configuration and must be checked there.

## Defaults and structure

- Single `index.html` with a hash router and lazy page modules.
- Blocks are free text with suggestions rather than a fixed hostel inventory; common-area locations use the room/area field.
- Target dates are calendar days; overdue means before today and still unresolved. No automatic severity-based SLA or escalation schedule is assumed.
- Resident and technician lists load up to 500 tickets; triage loads up to 500 open tickets. Admin register uses server pagination, with complete filtered CSV export. Notifications show the latest 60; no automatic retention deletion is configured.
- `profiles.email` mirrors signup email for admin user management. The UI does not offer email changes.
- No automatic ticket closure: a resident confirms resolution or an admin reopens a disputed case.
- Application identity: **HostelCare**; tracking IDs use `HMT-YYYY-000123` with a global sequence that does not reset annually.

```text
index.html                 App document
css/                       Tokens, base, components and responsive layouts
js/config.example.js       Public connection configuration template
js/pages/                  Resident, technician, admin and account screens
js/components/             Shared ticket, photo, assignment and timeline UI
supabase/schema.sql        Database, authorization, storage and realtime
supabase/seed.sql          Optional development accounts and sample tickets
tests/                     Static and PostgreSQL regression checks
manifest.webmanifest       PWA metadata
sw.js                      Local app-shell cache
icons/                     App and maskable icons
```
