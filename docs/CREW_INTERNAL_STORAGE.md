# Crew Management internal storage

All Crew collections and the employee directory use the internal database.
The default server is `10.3.230.60:27017`, database `crew_management`.
New Crew Notice attachments remain in `backend/uploads/crew_threads`.
Existing GridFS attachments are read from the same internal database.

## Configuration

```dotenv
MONGO_URI=mongodb://10.3.230.60:27017/
MONGO_DB_NAME=rtg_db
CREW_LOCAL_MONGO_URI=mongodb://10.3.230.60:27017/
CREW_LOCAL_MONGO_DB_NAME=crew_management
```

Crew also accepts the existing `CREW_MONGO_URI`, `CREW_MONGO_DB_NAME`, and
`CREW_DATABASE_NAME` fallbacks. Database URIs must use the standard scheme
and private/loopback IP addresses, localhost, or an internal.erldc.in hostname.
Discovery URIs and external hostnames are rejected before network activity.
Obsolete cloud configuration is ignored; remove it from deployment environments.

Restart each deployed backend worker after installing this change. No remote
records are copied automatically: confirm required operational records and
attachments are available internally before resuming production use.


## Refresh a deployed instance

Copy the updated checkout (including `start_server.ps1`) to the actual LAN server.
Run `start_server.bat` from that folder. It prints the project path and local Git
commit, validates database configuration, rebuilds the frontend using installed
packages offline, stops recognized server process trees, clears backend bytecode,
and starts one backend without auto-reload plus the frontend. It opens the page
only after both respond. Logs are in `.runtime` in the project folder.
The launcher never pulls Git changes or installs dependencies. Latest means the
files currently in that folder; updating a development PC does not update a
separate deployment. Use your approved deployment procedure to transfer changes.

A Python environment with the backend requirements and installed frontend
packages is required. An existing `.venv` is preferred; otherwise Python on PATH
is used. An unrelated service on ports 8001/3001 causes an error rather than being
terminated. If a service manager restarts an old deployment, stop or update that
service first. Old copies on other ports or computers need separate retirement.

Use `powershell -NoProfile -File .\start_server.ps1 -CheckOnly` to inspect which
processes the launcher would replace, without changing anything.
Run `powershell -NoProfile -File .\diagnose_database_connections.ps1` on the
machine reported by the network team to identify processes using database port
27017. This inspection makes no database connection. A snapshot can miss short
attempts; repeat while the network team observes the traffic.

Both database clients use direct connections to a single internal endpoint.
Proxy URI options and multiple seed hosts are rejected. Replica member discovery
is disabled, so a server cannot redirect the driver to additional hosts.
Approved email and data feeds remain enabled; this is a database restriction,
not a machine-wide Internet firewall. Windows/browser traffic must be attributed
to its owning process separately.


## One-time Python setup

Run `setup_backend.bat` on each deployment machine to create `.venv` and install
`backend/requirements.txt`, including python-dotenv. This setup command uses the
configured package index; normal startup does not download packages. On an
isolated LAN machine, supply a folder of approved compatible wheels instead:
`setup_backend.bat D:\approved-wheels`. That mode uses `--no-index` and never
contacts a package index. Create the virtual environment on its destination
machine rather than copying `.venv` between computers.
