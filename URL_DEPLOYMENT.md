# URL Based Deployment

The app is now prepared for URL/domain based access.

## Recommended Setup

Use one public URL for both frontend and backend:

```text
https://astro.example.in        -> frontend
https://astro.example.in/api    -> backend FastAPI
```

This is the simplest setup because the frontend already calls `/api` by default, so browser calls stay on the same domain.

## Backend

Run FastAPI on an internal port:

```powershell
cd D:\RTG-project\backend
$env:MONGO_URI="mongodb://10.3.230.60:27017/"
$env:MONGO_DB_NAME="rtg_db"
$env:CORS_ALLOW_ORIGINS="https://astro.example.in,http://localhost:3001"
python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

For a Windows service or scheduled startup, set the same environment variables in the service configuration.

## Frontend

For production with same-domain `/api`, no API URL is needed:

```powershell
cd D:\RTG-project\frontend
npm run build
```

Serve `frontend/dist` from the public URL.

For local development:

```powershell
cd D:\RTG-project\frontend
$env:VITE_API_PROXY_TARGET="http://127.0.0.1:8001"
npm run dev
```

## Nginx Reverse Proxy Example

Replace `astro.example.in` with the real DNS name.

```nginx
server {
    listen 80;
    server_name astro.example.in;

    root D:/RTG-project/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## DNS

Create a DNS record:

```text
astro.example.in -> server IP
```

After DNS and reverse proxy are ready, users should open only:

```text
https://astro.example.in
```

No browser-facing IP or port should be required.

## Notes

- Internal source systems such as RTG, PSP, CRMS, MDP, MongoDB, or network shares may still use internal IPs if those systems do not have DNS names.
- Browser-facing URLs are now configurable and should not be hardcoded in React source.
- In production, prefer HTTPS and set `CORS_ALLOW_ORIGINS` to the exact portal URL.
