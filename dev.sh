#!/bin/bash
# Permish — Local HTTPS development
#
# Starts backend, frontend, and Caddy for https://dev.permish.app
# Access from mobile: https://192.168.3.1
#
# Prerequisites:
#   sudo mkcert -install
#   echo "127.0.0.1 dev.permish.app" | sudo tee -a /etc/hosts

set -e

LOCAL_IP=$(ifconfig en0 2>/dev/null | grep "inet " | awk '{print $2}')

echo "=== Permish Local HTTPS Dev ==="
echo ""
echo "  Desktop:  https://dev.permish.app"
echo "  Mobile:   https://${LOCAL_IP}"
echo "  Backend:  http://localhost:3001"
echo ""

# Check hosts entry
if ! grep -q "dev.permish.app" /etc/hosts 2>/dev/null; then
  echo "⚠  Add to /etc/hosts:  127.0.0.1 dev.permish.app"
  echo "   Run: echo '127.0.0.1 dev.permish.app' | sudo tee -a /etc/hosts"
  echo ""
fi

# Check certs
if [ ! -f certs/dev.pem ]; then
  echo "⚠  Certs not found. Generating..."
  mkdir -p certs
  mkcert -cert-file certs/dev.pem -key-file certs/dev-key.pem \
    "dev.permish.app" "localhost" "127.0.0.1" "${LOCAL_IP}"
fi

# Check mkcert CA
if ! mkcert -install 2>/dev/null; then
  echo "⚠  Run: sudo mkcert -install"
fi

# Start backend
echo "Starting backend..."
(cd backend && pnpm dev) &
BACKEND_PID=$!

# Start frontend with HTTPS proxy config
echo "Starting frontend..."
(cd frontend && VITE_DEV_HTTPS=true PUBLIC_API_URL=https://dev.permish.app/api pnpm dev --host 0.0.0.0) &
FRONTEND_PID=$!

# Wait for services to start
sleep 3

# Start Caddy
echo "Starting Caddy HTTPS proxy..."
caddy run --config Caddyfile.dev &
CADDY_PID=$!

echo ""
echo "=== All services running ==="
echo "Press Ctrl+C to stop all"

# Cleanup on exit
cleanup() {
  echo ""
  echo "Stopping services..."
  kill $CADDY_PID $FRONTEND_PID $BACKEND_PID 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Wait for any process to exit
wait
