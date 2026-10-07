# Reverse proxy

BackseatFin publishes two plain-HTTP ports. Put each behind HTTPS on its own hostname:

| Hostname (example) | Port | What it is |
|---|---|---|
| `car.example.com` | `CAR_PORT` (8097) | Emby with the car player added. Open this in the car. |
| `admin.example.com` | `ADMIN_PORT` (8098) | Playlists, devices, the car test page. |

Both carry long-lived video streams over WebSockets, so don't put them behind a proxy
or tunnel that buffers responses or cuts connections after a few minutes.

## Caddy

```caddyfile
car.example.com {
    reverse_proxy 192.168.1.10:8097
}

admin.example.com {
    reverse_proxy 192.168.1.10:8098
}
```

## nginx

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl;
    server_name car.example.com;
    # ssl_certificate ...;

    client_max_body_size 0;

    location / {
        proxy_pass http://192.168.1.10:8097;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_read_timeout 6h;
        proxy_send_timeout 6h;
    }
}
```

Repeat the server block for `admin.example.com` → port 8098.

Pass `X-Forwarded-Proto`: the server marks its cookies `Secure` when it sees `https`.

## fail2ban

The server answers 401 or 403 only when a wrong credential is presented (a bad admin
key, a revoked device, a rejected Emby token). "Not signed in yet" is never a 401. So
you can ban IPs that collect several 401/403s in a few minutes from your proxy's access
log, without the car banning itself. On the car host, the same log also shows Emby's own
failed logins.
