#!/bin/bash
# Self-Signed SSL Certificate Setup for Nginx
# For testing only - not for production use
# Run with: sudo bash nginx-ssl-selfsigned.sh

set -e

echo "=== Self-Signed SSL Certificate Setup ==="
echo "WARNING: Self-signed certificates are for testing only!"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo bash nginx-ssl-selfsigned.sh"
    exit 1
fi

# Create SSL directory
mkdir -p /etc/nginx/ssl

# Generate self-signed certificate
echo "Generating self-signed certificate..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/prowhey-middleware.key \
    -out /etc/nginx/ssl/prowhey-middleware.crt \
    -subj "/C=US/ST=State/L=City/O=ProWhey/CN=193.42.63.107"

# Set permissions
chmod 600 /etc/nginx/ssl/prowhey-middleware.key
chmod 644 /etc/nginx/ssl/prowhey-middleware.crt

# Update Nginx config for SSL
cat > /etc/nginx/sites-available/prowhey-middleware << 'NGINXEOF'
# HTTP - Redirect to HTTPS
server {
    listen 80;
    server_name 193.42.63.107;
    return 301 https://$server_name$request_uri;
}

# HTTPS - Main server
server {
    listen 443 ssl http2;
    server_name 193.42.63.107;

    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/prowhey-middleware.crt;
    ssl_certificate_key /etc/nginx/ssl/prowhey-middleware.key;
    
    # SSL Security Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Logging
    access_log /var/log/nginx/prowhey-middleware-access.log;
    error_log /var/log/nginx/prowhey-middleware-error.log;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://localhost:3001/health;
        proxy_set_header Host $host;
    }
}
NGINXEOF

# Test and reload
echo "Testing Nginx configuration..."
nginx -t

echo "Reloading Nginx..."
systemctl reload nginx

echo ""
echo "=== Self-Signed SSL Setup Complete ==="
echo ""
echo "⚠️  WARNING: Self-signed certificate - browsers will show security warning"
echo ""
echo "Test HTTPS: curl -k https://193.42.63.107/health"
echo ""
echo "For production, use Let's Encrypt with a domain name:"
echo "sudo certbot --nginx -d your-domain.com"

