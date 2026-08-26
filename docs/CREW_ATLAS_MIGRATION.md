# Crew Management: Local MongoDB + Atlas

## Data ownership

The portal uses a hybrid model after `CREW_USE_ATLAS=true`:

- Local MongoDB is authoritative for employees, employee-master hierarchy, passwords, OTP challenges, login history, page access, mail/auth settings, and local sequences.
- Atlas is authoritative for rosters, daily duties, leave, training, compensatory off, replacements, duty exchanges, notifications, Crew Notices, and portal audit events.
- A daily 02:30 Asia/Kolkata job mirrors the employee directory and its organization/designation masters to Atlas.
- The Atlas `employees` mirror never contains password, OTP, reset-token, access-token, refresh-token, session-token, secret, or credential fields.
- Login history, OTP challenges, and page-access records are never migrated.

Crew Notice binaries are stored in Atlas GridFS after cutover. The migration tool also uploads existing local Crew Notice attachments and writes their GridFS IDs into the migrated message documents.

## Configuration and cutover

Keep all values in the backend service environment or the gitignored `backend/.env` file:

```env
CREW_LOCAL_MONGO_URI=mongodb://<local-host>:27017/
CREW_LOCAL_MONGO_DB_NAME=crew_management
CREW_ATLAS_MONGO_URI=mongodb+srv://<db-user>:<url-encoded-password>@<cluster>/?appName=CrewApp
CREW_ATLAS_MONGO_DB_NAME=crew_management
CREW_USE_ATLAS=false
```

1. In Atlas Network Access, allow the current migration machine's public IP. For a hosted service, allow its fixed outbound IP when available. Avoid `0.0.0.0/0`; if a free host requires it, use a dedicated least-privilege Atlas user and rotate its password regularly.
2. From `backend`, run `python scripts/migrate_crew_to_atlas.py` for a dry run.
3. Run `python scripts/migrate_crew_to_atlas.py --execute` to upsert operational data, indexes, the sanitized employee mirror, and Crew Notice files.
4. Confirm that every populated collection reports `countVerified: true` and that the attachment report has no missing files.
5. Set `CREW_USE_ATLAS=true` and restart the backend.
6. Test login (local), Crew Calendar, Leave, Replacement, Training, Crew Notices download/upload, and Audit Trail.

The migration is idempotent: rerunning it upserts documents by their existing MongoDB `_id`. It does not delete operational Atlas records. The employee-directory mirror is an exact one-way mirror and removes Atlas mirror records that were removed locally.

Run an employee mirror manually with:

```powershell
python scripts/sync_employee_directory_to_atlas.py --dry-run
python scripts/sync_employee_directory_to_atlas.py
```

## Instructions for the separately hosted application

The hosted application's browser must never connect directly to Atlas and must never contain `MONGODB_URI` in frontend/Vite variables. Its server connects to Atlas using a dedicated database user, ideally with `read` access to only `crew_management` if the application is read-only.

Because portal credentials remain on the local network, the hosted application cannot reuse the existing username/password login without a secure local authentication API. The recommended login is Microsoft Entra ID/OpenID Connect:

1. Authenticate the user through Entra ID in the hosted app.
2. On the server, validate the ID token's issuer, audience, signature, and expiry.
3. Match the verified email/employee ID to the sanitized Atlas `employees` collection and require the employee to be active.
4. Create the hosted application's own secure HTTP-only session cookie.
5. Never copy local password hashes, OTP records, login history, JWT secrets, or page-access records to Atlas.

Prompt for the Codex working on the other application:

> Configure the server-side MongoDB connection from `MONGODB_URI` and database `crew_management`; never expose the URI to browser code. Read employee identity from the sanitized `employees` mirror and operational data from the other collections. Implement Microsoft Entra ID/OIDC login, validate tokens server-side, allow only active employee records, and use secure HTTP-only sessions. Do not create or expect password, OTP, login-history, or page-access data in Atlas. Crew Notice files are in the `crew_thread_files` GridFS bucket and referenced by `crew_thread_messages.attachments[].gridFsId`.
