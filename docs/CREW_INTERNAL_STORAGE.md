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
