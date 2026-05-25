#!/bin/sh

# No set -e: handle failures explicitly so the container stays alive.
LOG="/data/api.log"
echo "--- $(date) ---" >> "$LOG"

export CONFIG_ENV="${CONFIG_ENV:-/data/config.env}"
export APP_ID="${APP_ID:-albercoin-store-frigate}"
export INIT_SCRIPT="${INIT_SCRIPT:-/init.sh}"

# Create CGI scripts for Busybox httpd (built-in, no packages needed)
mkdir -p /tmp/httpd/cgi-bin

# POST /api/save → httpd runs cgi-bin/save
cat > /tmp/httpd/cgi-bin/save << 'CGI'
#!/bin/sh

CONFIG_ENV="${CONFIG_ENV:-/data/config.env}"
APP_ID="${APP_ID:-albercoin-store-frigate}"
INIT_SCRIPT="${INIT_SCRIPT:-/init.sh}"
LOG="/data/api.log"

echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo ""

# Read POST body via CONTENT_LENGTH (set by Busybox httpd for POST CGI)
body=""
if [ -n "$CONTENT_LENGTH" ] && [ "$CONTENT_LENGTH" -gt 0 ] 2>/dev/null; then
    body=$(dd bs="$CONTENT_LENGTH" count=1 2>/dev/null)
fi

if [ -z "$body" ]; then
    echo '{"status":"error","message":"empty body received"}'
    exit 0
fi

# Save config
echo "$body" | sed 's/[{}]//g; s/","/\n/g; s/":"/="/g; s/"//g' > "$CONFIG_ENV"
chmod 644 "$CONFIG_ENV"

# Run init script to regenerate config files
if [ -f "$INIT_SCRIPT" ]; then
    sh "$INIT_SCRIPT" 2>>"$LOG" || true
fi

# Send response BEFORE attempting restart
echo '{"status":"ok","message":"Settings saved, server restarting..."}'

# Restart server container via Docker socket (if socat was installed)
if [ -S /var/run/docker.sock ] && command -v socat >/dev/null 2>&1; then
    (
        sleep 1
        CONTAINER="${APP_ID}_server_1"
        timeout 15 sh -c 'printf "POST /containers/%s/restart HTTP/1.0\r\nHost: localhost\r\n\r\n" "$1" | socat - UNIX-CONNECT:/var/run/docker.sock' _ "$CONTAINER" >/dev/null 2>&1 || echo "restart failed" >> "$LOG"
    ) &
fi
CGI
chmod +x /tmp/httpd/cgi-bin/save

# GET /api/health → httpd runs cgi-bin/health
cat > /tmp/httpd/cgi-bin/health << 'CGI'
#!/bin/sh
echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo ""
echo '{"status":"healthy"}'
CGI
chmod +x /tmp/httpd/cgi-bin/health

# Try installing socat in background for Docker restart capability
# This is best-effort — HTTP API works without it.
apk add --no-cache socat >> "$LOG" 2>&1 &
APK_PID=$!

echo "starting httpd on port 8081" >> "$LOG"

# Start Busybox httpd in foreground (daemonizing would exit the container)
exec busybox httpd -p 8081 -h /tmp/httpd -f
