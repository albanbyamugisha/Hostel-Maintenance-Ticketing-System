# Hostel Maintenance Ticketing System

HostelCare manages facility reports from resident submission through technician repair and resident confirmation. It includes separate resident, technician and administrator workspaces, photos, notifications, audit timelines and reports.

## Run

From the project folder:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open [http://localhost:8080](http://localhost:8080). No Supabase project, database configuration, package installation or build step is required. Use localhost or HTTPS in a modern browser; opening `index.html` directly through `file://` is not supported.

## Initial accounts

| Name | Email | Role / specialty |
| --- | --- | --- |
| Byamukama Derrick | derrick@hostel.com | Administrator |
| Ahumuza Racheal | racheal@hostel.com | Resident |
| Natweeta Cyril | cyril@hostel.con | Resident |
| Ainembabazi Alison | alison@hostel.com | Resident |
| Ataho Aprinal | ataho@hostel.com | Technician — plumbing |
| Akatwijuka Annibow | annibow@hostel.com | Technician — electrical |
| Murungi collins | collins@hostel.com | Technician — general |
| Nimusiima Janepher | janepher@hostel.com | Technician — general |
| Ssekajigo Elvis Mark | mark@hostel.com | Technician — general |
| Byamugisha Alban | alban@hostel.com

Initial passwords are configured as supplied by the project owner. Alison and Annibow use the separately confirmed initial passwords. Passwords are not displayed on the login page. Cyril's `.con` email is intentional and matches the supplied account identifier. Technician specialties are initial defaults and can be changed by the administrator.

When upgrading from the earlier sample-account version, the initial account identities and credentials are updated once. Existing tickets, photos, custom registered users and administrator-created technicians are retained. Subsequent password changes are preserved across reloads.

## Administrator

Sign in as Byamukama Derrick to:

- View triage, emergencies, unassigned tickets and overdue work.
- Assign/reassign technicians with target completion dates.
- Search and filter the ticket register and export CSV.
- Open **People → Add technician** to create a technician's name, email, initial password, specialty and optional phone number. The technician can sign in immediately; creating the account keeps the administrator signed in.
- Edit user roles/specialties, activate/deactivate accounts and reset passwords through People.
- View reports, technician performance and overdue work.

The administrator cannot deactivate or demote their own account. Duplicate email addresses are rejected. Only administrators may add technicians.

## Residents

The three listed residents can sign in immediately. Other residents select **Create a resident account** on the login page. Their details and password hashes are saved automatically, and they can sign in again after signing out or reloading.

Residents can report an issue with up to three photos, search their tickets, read updates and timeline events, and confirm a completed repair with an optional 1–5 rating and feedback. Rejecting an incomplete repair requires a reason and reopens the ticket.

Registration always creates a resident. A resident cannot select an administrator or technician role during registration.

## Technicians

Technicians see jobs assigned to them. They can start/resume work, put a job on hold with a reason, add work logs/parts/photos, and mark repairs resolved with a work log. The resident then verifies the repair.

## Ticket lifecycle

| Actor | Allowed transition |
| --- | --- |
| Resident | New issue → reported |
| Administrator | reported / reopened / assigned → assigned |
| Assigned technician | assigned / reopened → in_progress |
| Assigned technician | in_progress → on_hold, with a reason |
| Assigned technician | on_hold → in_progress |
| Assigned technician | in_progress → resolved, with a work log |
| Reporting resident | resolved → closed, or resolved → reopened with a reason |
| Administrator | resolved / closed → reopened with a reason |

Assignment notifies the resident and technician; holds notify administrators; completion notifies the resident; rejection notifies the technician and administrators. Each workflow action adds a timeline entry. Account-specific views and valid transitions are checked by the application layer.

## Passwords and profiles

Passwords require at least six characters to accommodate the supplied credentials. Passwords are stored as salted PBKDF2 hashes. Users can change their password and contact/residence details from Profile. For a forgotten password, contact the administrator, who can set a replacement from People. The application does not send email recovery links.

## Storage and deployment boundary

This edition stores ticket/account records in browser localStorage and photo blobs in IndexedDB. Sessions use tab-scoped sessionStorage. Use the same browser and exact site address to retain records; different browsers, devices, ports or hostnames have separate datasets. Separate tabs on the same origin can sign into different accounts and receive change notifications.

Registered residents and added technicians remain saved across ordinary reloads and sign-outs. Clearing site storage deletes saved changes and restores the initial dataset on the next launch. Private browsing may discard data when closed. Browser storage is limited, and failed saves produce an error.

There is no shared server or server-enforced authentication. Someone with access to browser storage/developer tools can inspect or modify records. This implementation is suitable for a single-browser installation and project presentation; independent devices do not share accounts or tickets, and protected institutional deployment requires a server-backed implementation.

The service worker caches the application and bundled Chart.js library for offline use after the first successful load. HTTPS or localhost is required for service workers and supported PWA installation. Static hosting works without route rewrites because navigation uses hash routes.

## Interface and reports

The interface includes phone bottom navigation, a desktop sidebar, stacked tables, light/dark themes, keyboard-accessible dialogs, image compression and clear loading/error states. Reports include status/category/severity/block distributions, weekly tickets, assignment/resolution time, technician ratings/reopen rates and CSV export. The initial dataset includes 15 sample tickets with history across all statuses.

## Source and checks

```text
js/accounts.js             Initial identities and salted credential hashes
js/localData.js            Persistence, account migration and change notifications
js/auth.js                 Login, registration, passwords and technician creation
js/api.js                  Ticket workflows, users, reports and photo storage
js/pages/                  Resident, technician, administrator and account screens
js/components/             Shared forms, modals, timeline and photo controls
vendor/                    Bundled Chart.js and its MIT license
tests/                     Module, asset and account/workflow regression checks
archive/supabase/          Inactive original backend reference
```

The original backend archive is not used by the application. There are no remote runtime dependencies.

Run checks with Node 20+ (not required to use the app):

```sh
node --experimental-vm-modules tests/check.cjs
node --experimental-vm-modules tests/local.cjs
```

The checks cover module imports, cached assets, initial logins, role restrictions, technician creation, duplicate emails, resident registration/persistence, account migration, password changes and the ticket lifecycle.
