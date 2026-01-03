#!/bin/bash
# Nginx SSL Setup Script for ProWhey Middleware
# Run with: bash nginx-ssl-setup.sh

set -e

echo "=== Nginx SSL Setup for ProWhey Middleware ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run with sudo: sudo bash nginx-ssl-setup.sh"
    exit 1
fi

# Step 1: Copy Nginx config
echo "Step 1: Installing Nginx configuration..."
cp /tmp/prowhey-middleware-nginx.conf /etc/nginx/sites-available/prowhey-middleware

# Step 2: Enable site
echo "Step 2: Enabling site..."
ln -sf /etc/nginx/sites-available/prowhey-middleware /etc/nginx/sites-enabled/

# Step 3: Remove default site (optional)
read -p "Remove default Nginx site? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f /etc/nginx/sites-enabled/default
    echo "Default site removed"
fi

# Step 4: Test Nginx config
echo "Step 4: Testing Nginx configuration..."
nginx -t

# Step 5: Reload Nginx
echo "Step 5: Reloading Nginx..."
systemctl reload nginx

echo ""
echo "=== Nginx HTTP setup complete ==="
echo ""
echo "To set up SSL with Let's Encrypt:"
echo "1. Point a domain name to this server (193.42.63.107)"
echo "2. Run: sudo certbot --nginx -d your-domain.com"
echo ""
echo "Or for self-signed certificate (testing only):"
echo "Run: sudo bash nginx-ssl-selfsigned.sh"
echo ""
echo "Current setup: HTTP on port 80 -> Middleware on port 3001"
echo "Test: curl http://193.42.63.107/health"

