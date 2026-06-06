# ⚡ upiCHARGE — UPI-Based EV Charging Platform

**upiCHARGE** is a full-stack, mobile-first EV (Electric Vehicle) charging platform that enables customers to scan a QR code, pay via UPI (Razorpay), and remotely start/stop physical EV chargers managed through chargeMOD's OCPP console — all without installing any native app.

---

## Table of Contents

- [Features](#features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development Setup](#local-development-setup)
- [Production Deployment on AWS Ubuntu](#production-deployment-on-aws-ubuntu)
  - [1. Server Provisioning](#1-server-provisioning)
  - [2. Install System Dependencies](#2-install-system-dependencies)
  - [3. Clone the Repository](#3-clone-the-repository)
  - [4. Configure Environment Variables](#4-configure-environment-variables)
  - [5. Install Python Dependencies](#5-install-python-dependencies)
  - [6. Install Frontend Dependencies & Build](#6-install-frontend-dependencies--build)
  - [7. Start Services with PM2](#7-start-services-with-pm2)
  - [8. Configure Nginx Reverse Proxy](#8-configure-nginx-reverse-proxy)
  - [9. Enable HTTPS with Let's Encrypt](#9-enable-https-with-lets-encrypt)
  - [10. Configure Razorpay Webhook](#10-configure-razorpay-webhook)
  - [11. Point Your Domain DNS](#11-point-your-domain-dns)
- [Testing](#testing)
  - [Testing in Dummy Mode](#testing-in-dummy-mode)
  - [Testing in Live Mode](#testing-in-live-mode)
- [Admin Dashboard](#admin-dashboard)
- [API Reference](#api-reference)
- [Data Files & Runtime Storage](#data-files--runtime-storage)
- [Common Operations](#common-operations)
- [Troubleshooting](#troubleshooting)
- [Security Notes](#security-notes)
- [License](#license)

---

## Features

| Feature | Description |
|---|---|
| **QR Code Scanner** | GPay-style instant camera scanner with photo fallback. Scans charger QR codes to identify physical chargers. |
| **UPI Payments via Razorpay** | Pre-authorized UPI payments via Razorpay Checkout widget. Customers pay upfront; unused balance is auto-refunded. |
| **Live Charging Dashboard** | Real-time telemetry: Power (kW), Voltage (V), Current (A), Energy (kWh), and running cost (₹) during active sessions. |
| **Automatic Prepaid Auto-Stop** | Two-layer protection: client-side polling + server-side daemon thread. Automatically stops the charger the moment cost reaches the prepaid limit. |
| **Instant UPI Refunds** | Partial refunds are automatically calculated and issued to the customer's UPI account via Razorpay when charging stops. |
| **Admin Console** | Full executive admin dashboard at `/admin` — live sessions, transaction ledger, manual refunds, OCPP remote start/stop, payment mode toggle, and live support chat management. |
| **Charger Locator Map** | Interactive Leaflet.js map with geolocation, distance calculations (Haversine), and selectable charger pins. |
| **Live Support Chat** | Real-time double-sided support chat between customers and operators. |
| **Fuzzy Charger Search** | Spacing/punctuation-insensitive charger ID resolution (e.g., `cb140`, `c b 140`, `cb-140` all resolve correctly). |
| **Browser Notifications** | Rich HTML5 push notifications on charge start/stop events. |

---

## Architecture Overview

```
                          ┌────────────────────────────────┐
                          │         CUSTOMER DEVICE        │
                          │  (Mobile Browser / Desktop)    │
                          │   Next.js Frontend (:3000)     │
                          └────────────┬───────────────────┘
                                       │  /api/* proxied
                                       ▼
                          ┌────────────────────────────────┐
                          │   Nginx Reverse Proxy (:80/443)│
                          │   ┌──────────┐  ┌───────────┐  │
                          │   │:3000 Next │  │:8000 Fast │  │
                          │   │  (SSR)    │  │  API      │  │
                          │   └──────────┘  └───────────┘  │
                          └────────────────────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          ▼                            ▼                            ▼
 ┌────────────────┐         ┌────────────────────┐       ┌────────────────┐
 │  chargeMOD     │         │   Razorpay API     │       │  MongoDB Atlas │
 │  Console APIs  │         │  (Orders, Refunds, │       │  (charger DB)  │
 │  (OCPP control)│         │   Webhooks)        │       │                │
 └────────────────┘         └────────────────────┘       └────────────────┘
```

**Flow:**
1. Customer scans a QR code or manually enters a charger ID.
2. Backend resolves the charger identity via chargeMOD APIs.
3. Customer selects a connector and prepaid amount, pays via Razorpay UPI checkout.
4. Razorpay sends a `payment.captured` webhook → Backend auto-starts the physical charger via OCPP.
5. Real-time telemetry is streamed to the dashboard during charging.
6. When the session ends (manual stop or auto-stop at prepaid limit), the backend calculates the exact usage and issues an automatic partial refund.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, FastAPI, Uvicorn |
| **Frontend** | Next.js 14, React 18, Tailwind CSS, Lucide React Icons |
| **QR Scanner** | html5-qrcode |
| **Maps** | Leaflet.js (loaded via CDN) |
| **Payments** | Razorpay (Orders, Checkout, Webhooks, Refunds) |
| **Hardware Control** | chargeMOD Console REST APIs (OCPP-based remote start/stop) |
| **Database** | MongoDB Atlas (charger metadata), JSON flat files (transactions, active sessions, support chats) |
| **Process Manager** | PM2 |
| **Web Server** | Nginx (reverse proxy) |
| **SSL** | Let's Encrypt (Certbot) |
| **Hosting** | AWS EC2 (Ubuntu 22.04 LTS) |

---

## Project Structure

```
upiCHARGE/
├── .env                          # Environment variables (NOT committed to git)
├── .gitignore                    # Git ignore rules
├── main.py                       # FastAPI application entry point
├── README.md                     # This file
│
├── app/                          # FastAPI application package
│   ├── __init__.py
│   ├── config.py                 # Reads .env, exports HOST, PORT, PAYMENT_MODE, Razorpay keys
│   └── routers/
│       ├── __init__.py
│       ├── charging.py           # Core charging endpoints: verify, start, stop, status, nearby
│       ├── payments.py           # Razorpay: create-order, webhook, config, transaction CRUD
│       ├── admin.py              # Admin: refunds, remote start/stop, config toggle, stats
│       └── support.py            # Live support chat: send message, get threads, admin reply
│
├── api-call/                     # Low-level chargeMOD integration scripts
│   ├── auth_key.py               # JWT auth token management with caching
│   ├── chargepoints.py           # Charger list, details, fuzzy resolve from chargeMOD APIs
│   ├── charger_action.py         # OCPP remote start/stop, QR-based stop, socket control
│   ├── RemoteStart.py            # Customer info, wallet balance, chargepoint detail helpers
│   ├── RemoteStop.py             # Active transaction metrics extraction, billing calculation
│   └── customer_data.py          # Customer profile lookups
│
├── data/                         # Runtime data storage (auto-created)
│   ├── chargers/                 # Cached charger JSON files
│   │   ├── chargers_list.json    # Last search result cache
│   │   └── charger_*.json        # Per-charger detail cache files
│   ├── active_payments.json      # Currently active charging sessions (auto-managed)
│   ├── transactions_db.json      # Full transaction history ledger
│   ├── support_chats.json        # Support chat threads (auto-managed)
│   └── token_cache.json          # chargeMOD JWT token cache (auto-managed)
│
├── frontend/                     # Next.js frontend application
│   ├── package.json              # Node.js dependencies
│   ├── next.config.mjs           # Next.js config with API proxy rewrites
│   ├── tailwind.config.js        # Tailwind CSS configuration
│   ├── postcss.config.js         # PostCSS configuration
│   └── src/
│       └── app/
│           ├── layout.js         # Root HTML layout with Google Fonts (Outfit)
│           ├── globals.css       # Global CSS styles
│           ├── page.js           # Main customer-facing SPA (scanner, checkout, dashboard)
│           └── admin/
│               └── page.js       # Admin control console
│
└── startup_diagnostics.log       # Auto-generated on backend boot (connectivity check)
```

---

## Prerequisites

Before you begin, ensure you have:

1. **An AWS account** with an EC2 instance running **Ubuntu 22.04 LTS** (or similar Debian-based Linux).
2. **A domain name** pointed to your server's public IP (e.g., `upicharge.yourdomain.com`).
3. **chargeMOD Console access** — credentials (email/password) for the chargeMOD API that controls your physical OCPP chargers.
4. **Razorpay account** with:
   - API Key ID and Key Secret (from Razorpay Dashboard → Settings → API Keys).
   - A configured webhook (see [Step 10](#10-configure-razorpay-webhook)).
5. **MongoDB Atlas connection string** — the project uses MongoDB for charger metadata aggregation. You should already have a cluster configured by chargeMOD.

---

## Environment Variables

Create a `.env` file in the project root directory. Below is a template with all required variables:

```env
# ============================================================
# upiCHARGE Environment Configuration
# ============================================================

# --- Server Configuration ---
HOST=0.0.0.0
PORT=8000

# --- Payment Mode ---
# Set to 'dummy' for testing (simulates payments, no real money)
# Set to 'live' for production (real Razorpay payments)
PAYMENT_MODE=dummy

# --- chargeMOD Credentials ---
# Login credentials for the chargeMOD console APIs
USER_EMAIL=your_chargemod_email@example.com
USER_PASSWORD=your_chargemod_password

# --- Razorpay Credentials ---
# Get these from: Razorpay Dashboard → Settings → API Keys
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_string

# --- chargeMOD Microservice URLs ---
BASE_LS=https://ls.console.chargemod.com
BASE_TTS=https://tts.console.chargemod.com
BASE_AS=https://as.console.chargemod.com

# --- MongoDB Connection ---
# MongoDB Atlas URI for charger database aggregation
MONGO_URI=mongodb+srv://username:password@cluster.chargemod.com/console
```

> **⚠️ IMPORTANT:** The `.env` file contains sensitive credentials. It is listed in `.gitignore` and must NEVER be committed to version control. Create it manually on every deployment.

### Variable Reference

| Variable | Required | Description |
|---|---|---|
| `HOST` | Yes | Server bind address. Use `0.0.0.0` to accept external connections. |
| `PORT` | Yes | Backend API port. Default: `8000`. |
| `PAYMENT_MODE` | Yes | `dummy` = simulated payments (for testing). `live` = real Razorpay payments. |
| `USER_EMAIL` | Yes | chargeMOD console login email. |
| `USER_PASSWORD` | Yes | chargeMOD console login password. |
| `RAZORPAY_KEY_ID` | Yes | Razorpay API Key ID. Use `rzp_test_*` for testing, `rzp_live_*` for production. |
| `RAZORPAY_KEY_SECRET` | Yes | Razorpay API Key Secret. |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Secret string you set when creating the Razorpay webhook. |
| `BASE_LS` | Yes | chargeMOD Location Service URL. |
| `BASE_TTS` | Yes | chargeMOD Transaction/Telemetry Service URL. |
| `BASE_AS` | Yes | chargeMOD Auth Service URL. |
| `MONGO_URI` | Optional | MongoDB Atlas connection string. Required only for the `rebuild_charger_db()` aggregation function. The app works without it using API lookups. |

---

## Local Development Setup

These steps are for running the application on your local machine for development purposes.

### 1. Clone the Repository

```bash
git clone https://github.com/aeyo-node/upiCHARGE.git
cd upiCHARGE
```

### 2. Set Up Python Backend

```bash
# (Recommended) Create a Python virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install fastapi uvicorn pydantic requests python-dotenv razorpay pymongo
```

### 3. Create the `.env` File

Copy the template from [Environment Variables](#environment-variables) and fill in your credentials:

```bash
cp .env.example .env   # Or create manually
nano .env              # Edit with your credentials
```

Set `PAYMENT_MODE=dummy` for local testing.

### 4. Start the Backend

```bash
python main.py
```

The backend will start at `http://localhost:8000`. You should see startup diagnostics confirming chargeMOD connectivity.

### 5. Set Up & Start the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend will start at `http://localhost:3000`.

### 6. Access the Application

| URL | Description |
|---|---|
| `http://localhost:3000` | Customer-facing mobile web app |
| `http://localhost:3000/admin` | Admin control dashboard |
| `http://localhost:8000` | Backend API root (health check) |
| `http://localhost:8000/docs` | FastAPI auto-generated Swagger UI |

> **Note:** The Next.js frontend automatically proxies all `/api/*` requests to the backend at `localhost:8000` via the reverse proxy configuration in `next.config.mjs`.

---

## Production Deployment on AWS Ubuntu

This section provides a complete, step-by-step guide to deploying upiCHARGE on a fresh **AWS EC2 Ubuntu 22.04 LTS** instance.

### 1. Server Provisioning

1. Launch an **EC2 instance** with the following recommended specs:
   - **AMI:** Ubuntu Server 22.04 LTS (HVM), SSD Volume Type
   - **Instance Type:** `t3.small` (2 vCPU, 2GB RAM) minimum. `t3.medium` recommended for production.
   - **Storage:** 20 GB gp3 SSD minimum.
2. **Security Group** — open the following inbound ports:

   | Port | Protocol | Source | Purpose |
   |---|---|---|---|
   | 22 | TCP | Your IP | SSH access |
   | 80 | TCP | 0.0.0.0/0 | HTTP (redirects to HTTPS) |
   | 443 | TCP | 0.0.0.0/0 | HTTPS (production traffic) |

   > Ports 3000 and 8000 do NOT need to be exposed publicly. Nginx will proxy traffic internally.

3. **Allocate an Elastic IP** and associate it with your instance so the public IP doesn't change on reboot.
4. **SSH into your server:**
   ```bash
   ssh -i your-key.pem ubuntu@<YOUR_ELASTIC_IP>
   ```

### 2. Install System Dependencies

Update the system and install all required software:

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Python 3, pip, and venv
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js 20.x LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
python3 --version    # Should be 3.10+
node --version       # Should be 20.x
npm --version        # Should be 10.x

# Install PM2 globally (process manager)
sudo npm install -g pm2

# Install Nginx (reverse proxy)
sudo apt install -y nginx

# Install Certbot for SSL certificates
sudo apt install -y certbot python3-certbot-nginx

# Install Git
sudo apt install -y git
```

### 3. Clone the Repository

```bash
cd ~
git clone https://github.com/aeyo-node/upiCHARGE.git
cd upiCHARGE
```

### 4. Configure Environment Variables

Create the `.env` file with your production credentials:

```bash
nano .env
```

Paste the following and replace all placeholder values with your actual credentials:

```env
# Server
HOST=0.0.0.0
PORT=8000

# Payment Mode — set to 'live' for production
PAYMENT_MODE=live

# chargeMOD Credentials
USER_EMAIL=your_chargemod_email@example.com
USER_PASSWORD=your_chargemod_password

# Razorpay Credentials (use rzp_live_* keys for production)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_live_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# chargeMOD Service URLs
BASE_LS=https://ls.console.chargemod.com
BASE_TTS=https://tts.console.chargemod.com
BASE_AS=https://as.console.chargemod.com

# MongoDB (optional, for charger DB rebuild)
MONGO_URI=mongodb+srv://username:password@cluster.chargemod.com/console
```

Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

### 5. Install Python Dependencies

```bash
cd ~/upiCHARGE

# Option A: Using a virtual environment (Recommended)
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn pydantic requests python-dotenv razorpay pymongo

# Option B: User-level install (without venv)
pip3 install --user fastapi uvicorn pydantic requests python-dotenv razorpay pymongo
```

Verify uvicorn is accessible:

```bash
# If using venv:
which uvicorn
# Expected output: /home/ubuntu/upiCHARGE/venv/bin/uvicorn

# If using --user install:
which uvicorn
# Expected output: /home/ubuntu/.local/bin/uvicorn
```

> **⚠️ Note the full path** — you will need it for PM2 in the next steps.

### 6. Install Frontend Dependencies & Build

```bash
cd ~/upiCHARGE/frontend

# Install Node.js dependencies
npm install

# Build the production-optimized frontend
npm run build
```

The build output will be generated in `frontend/.next/`. This is a production-ready, server-side rendered (SSR) build.

> **⚠️ If the build fails**, check for any missing dependencies with `npm install` and retry. Common issues include missing `react` or `next` packages.

### 7. Start Services with PM2

PM2 keeps your backend and frontend running permanently, auto-restarts on crashes, and survives server reboots.

```bash
cd ~/upiCHARGE

# --- Start the Backend ---
# Replace the uvicorn path below with the output from `which uvicorn` in Step 5.

# If using venv:
pm2 start "venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name "upicharge-backend" \
  --cwd /home/ubuntu/upiCHARGE

# If using --user pip install:
pm2 start "/home/ubuntu/.local/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name "upicharge-backend" \
  --cwd /home/ubuntu/upiCHARGE

# --- Start the Frontend ---
cd ~/upiCHARGE/frontend
pm2 start "npm run start -- -p 3000" \
  --name "upicharge-frontend" \
  --cwd /home/ubuntu/upiCHARGE/frontend

# --- Verify Both Are Running ---
pm2 status
```

You should see both processes with status `online`:

```
┌────┬────────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name               │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ upicharge-backend  │ fork     │ 0    │ online    │ 0%       │ ~60mb    │
│ 1  │ upicharge-frontend │ fork     │ 0    │ online    │ 0%       │ ~85mb    │
└────┴────────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

Check logs to confirm both started successfully:

```bash
pm2 logs upicharge-backend --lines 30
pm2 logs upicharge-frontend --lines 10
```

**Enable PM2 to auto-start on server reboot:**

```bash
pm2 save
pm2 startup
# Follow the instructions printed by the above command (copy/paste the sudo command it outputs)
```

### 8. Configure Nginx Reverse Proxy

Create an Nginx server block that routes traffic:
- All requests → Next.js frontend (port 3000)
- `/api/*` requests → FastAPI backend (port 8000)

```bash
sudo nano /etc/nginx/sites-available/upicharge
```

Paste the following configuration. **Replace `upicharge.yourdomain.com`** with your actual domain:

```nginx
server {
    listen 80;
    server_name upicharge.yourdomain.com;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Max upload size (for QR images, etc.)
    client_max_body_size 10M;

    # API routes → FastAPI backend
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Everything else → Next.js frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site and restart Nginx:

```bash
# Enable the site
sudo ln -sf /etc/nginx/sites-available/upicharge /etc/nginx/sites-enabled/

# Remove the default site (optional but recommended)
sudo rm -f /etc/nginx/sites-enabled/default

# Test the configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 9. Enable HTTPS with Let's Encrypt

Obtain a free SSL certificate for your domain:

```bash
sudo certbot --nginx -d upicharge.yourdomain.com
```

Certbot will:
- Verify your domain ownership.
- Obtain and install the SSL certificate.
- Automatically modify your Nginx config to redirect HTTP → HTTPS.
- Set up auto-renewal (certificates renew automatically every 90 days).

**Test auto-renewal:**

```bash
sudo certbot renew --dry-run
```

After this step, your site will be accessible at `https://upicharge.yourdomain.com`.

### 10. Configure Razorpay Webhook

The webhook is critical. It ensures the backend is notified of successful payments even if the customer's browser closes mid-checkout.

1. Log in to the **Razorpay Dashboard** at `https://dashboard.razorpay.com`.
2. Navigate to **Settings** → **Webhooks** → **Add New Webhook**.
3. Configure as follows:

   | Field | Value |
   |---|---|
   | **Webhook URL** | `https://upicharge.yourdomain.com/api/payments/webhook` |
   | **Secret** | Enter the same string you set as `RAZORPAY_WEBHOOK_SECRET` in `.env` |
   | **Active Events** | Check **`payment.captured`** |

4. Click **Create Webhook**.

> **⚠️ CRITICAL:** The webhook URL MUST be publicly accessible over HTTPS. The secret string must match EXACTLY between Razorpay and your `.env` file.

### 11. Point Your Domain DNS

In your domain registrar's DNS settings, create an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `upicharge` (or `@` for root) | `<YOUR_EC2_ELASTIC_IP>` | 300 |

Wait for DNS propagation (usually 5–15 minutes). Then verify:

```bash
curl https://upicharge.yourdomain.com
# Should return: {"status":"online","app":"UPICharge.com REST API","mode":"live"}
```

🎉 **Your production deployment is complete!**

---

## Testing

### Testing in Dummy Mode

Dummy mode simulates the entire payment flow without touching Razorpay. No real money is involved.

1. Set `PAYMENT_MODE=dummy` in your `.env` file.
2. Restart the backend: `pm2 restart upicharge-backend`
3. Open the app in your browser.
4. Scan a charger QR code or type a charger ID (e.g., `cb 140` or `cmod0135`).
5. Select a connector and prepaid amount.
6. Click the green **"Start Charging"** button — the charger starts immediately without any payment flow.
7. Monitor the live charging dashboard.
8. Click **"Stop Charging"** — you'll see a simulated receipt with refund details.

### Testing in Live Mode

Live mode processes real payments via Razorpay.

1. Set `PAYMENT_MODE=live` in your `.env` file.
2. For testing with real payment flow but test money, use Razorpay **test keys** (`rzp_test_*`):
   - Set `RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx`
   - Set `RAZORPAY_KEY_SECRET=your_test_secret`
3. Restart the backend: `pm2 restart upicharge-backend`
4. Open the app and follow the same flow as above.
5. The Razorpay checkout widget will appear — use Razorpay's test card/UPI details to complete payment.
6. Verify:
   - Backend logs show `[Webhook] payment.captured` event received.
   - The charger starts automatically.
   - On stop, the refund is calculated and issued.

**Switch to production Razorpay keys** (`rzp_live_*`) only after successful testing.

---

## Admin Dashboard

Access the admin console at: `https://upicharge.yourdomain.com/admin`

### Admin Features

| Tab | Description |
|---|---|
| **Overview** | Total revenue, refund totals, transaction success rates, active session count. |
| **Active Sessions** | Live view of all active charging sessions with elapsed time and prepaid limits. |
| **Transactions** | Searchable ledger of all orders, payment statuses, and refund details. |
| **Remote Control** | OCPP Remote Start/Stop terminal — force-start or force-stop any charger by ID. |
| **Manual Refund** | Select a transaction and issue a manual partial refund. |
| **Support Chat** | Real-time operator chat interface — view all customer conversations and reply. |
| **Configuration** | Toggle `PAYMENT_MODE` between `dummy` and `live` in real-time (updates `.env` persistently). |

> **⚠️ Security:** The admin page currently has no authentication. In production, you should restrict access by IP in Nginx or add an authentication layer.

---

## API Reference

All API endpoints are served under `/api/`. FastAPI auto-generates interactive documentation at `/docs` (Swagger UI) and `/redoc`.

### Charging Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/charging/verify-station/{qr_code}` | Parse a QR code string, resolve charger identity, fetch live connector statuses. |
| `POST` | `/api/charging/start` | Start a physical charging session. Body: `{ charger_id, connector_id, customer_mobile, prepaid_amount }` |
| `GET` | `/api/charging/status/{charger_id}` | Get real-time telemetry for an active session (kWh, cost, voltage, current, power). |
| `POST` | `/api/charging/stop` | Stop charging, calculate billing, issue automatic refund. Body: `{ charger_id, customer_mobile, prepaid_amount }` |
| `GET` | `/api/charging/nearby?lat=...&lng=...` | Get nearest chargers with distance calculations. |

### Payment Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/payments/config` | Returns current `payment_mode` and Razorpay public key. |
| `POST` | `/api/payments/create-order` | Creates a Razorpay order for checkout. Body: `{ charger_id, connector_id, customer_mobile, amount }` |
| `POST` | `/api/payments/webhook` | Razorpay webhook receiver (called by Razorpay, not by frontend). |

### Admin Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/stats` | Platform overview metrics. |
| `GET` | `/api/admin/transactions` | List all transactions. |
| `GET` | `/api/admin/active-sessions` | List currently active charging sessions. |
| `POST` | `/api/admin/refund` | Issue a manual refund. Body: `{ payment_id, amount }` |
| `POST` | `/api/admin/remote-start` | Force OCPP remote start. Body: `{ charger_id, connector_id, prepaid_amount }` |
| `POST` | `/api/admin/remote-stop` | Force OCPP remote stop. Body: `{ charger_id }` |
| `POST` | `/api/admin/config` | Update payment mode. Body: `{ payment_mode: "dummy" \| "live" }` |

### Support Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/support/message` | Customer sends a support message. Body: `{ user_id, text, user_name }` |
| `GET` | `/api/support/messages/{user_id}` | Get chat history for a user. |
| `GET` | `/api/support/threads` | Admin: list all support chat threads. |
| `POST` | `/api/support/admin-reply` | Admin: reply to a user's chat. Body: `{ user_id, text }` |

---

## Data Files & Runtime Storage

The `data/` directory contains runtime-generated files. These are automatically created and managed by the application.

| File | Description | Safe to Delete? |
|---|---|---|
| `data/active_payments.json` | Currently active charging sessions mapped to Razorpay payment IDs. | ⚠️ Only when no active sessions exist. |
| `data/transactions_db.json` | Complete transaction history (orders, payments, refunds). | ❌ No — this is your financial ledger. Back up regularly. |
| `data/support_chats.json` | Support chat threads between customers and operators. | ✅ Yes — deleting clears chat history. |
| `data/token_cache.json` | Cached chargeMOD JWT auth token. Auto-refreshes on expiry. | ✅ Yes — will be regenerated on next API call. |
| `data/chargers/*.json` | Cached charger metadata from chargeMOD. | ✅ Yes — will be re-fetched from the API. |
| `startup_diagnostics.log` | Backend startup connectivity check results. | ✅ Yes. |

> **⚠️ Back up `data/transactions_db.json` regularly.** This file contains your complete financial transaction history.

---

## Common Operations

### Restarting Services

```bash
# Restart backend only
pm2 restart upicharge-backend

# Restart frontend only
pm2 restart upicharge-frontend

# Restart both
pm2 restart all
```

### Viewing Logs

```bash
# Live tail all logs
pm2 logs

# Backend logs only (last 50 lines)
pm2 logs upicharge-backend --lines 50

# Frontend logs only
pm2 logs upicharge-frontend --lines 50
```

### Deploying Code Updates

```bash
cd ~/upiCHARGE

# Pull latest code
git pull origin main

# Rebuild frontend (only needed if frontend code changed)
cd frontend
npm install        # In case new dependencies were added
npm run build

# Restart services
cd ~/upiCHARGE
pm2 restart all
```

If you get git merge conflicts on runtime files:

```bash
git stash          # Stash local runtime file changes
git pull origin main
git stash pop      # Re-apply local changes (optional)
```

### Switching Payment Modes

**Option 1: Via Admin Dashboard**
Navigate to `/admin` → Configuration tab → Toggle the payment mode switch.

**Option 2: Via `.env` file**
```bash
nano ~/upiCHARGE/.env
# Change PAYMENT_MODE=dummy  to  PAYMENT_MODE=live  (or vice versa)
pm2 restart upicharge-backend
```

### Checking Service Health

```bash
# Check if both services are running
pm2 status

# Check backend API health
curl http://localhost:8000

# Check if ports are in use
sudo lsof -i :8000    # Backend
sudo lsof -i :3000    # Frontend

# Check Nginx status
sudo systemctl status nginx
```

---

## Troubleshooting

### Backend won't start — `ModuleNotFoundError: No module named 'uvicorn'`

**Cause:** PM2 spawns a non-login shell that doesn't have your Python packages in its `PATH`.

**Fix:** Use the **absolute path** to `uvicorn` when starting PM2:
```bash
# Find your uvicorn path
which uvicorn
# e.g., /home/ubuntu/upiCHARGE/venv/bin/uvicorn

pm2 delete upicharge-backend
pm2 start "/home/ubuntu/upiCHARGE/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000" \
  --name "upicharge-backend" --cwd /home/ubuntu/upiCHARGE
```

### Port 8000 already in use — cannot bind

**Cause:** An orphaned Python/uvicorn process is occupying the port.

**Fix:**
```bash
# Find the process
sudo lsof -i :8000

# Kill it
sudo kill -9 <PID>

# If it keeps respawning, check PM2 for rogue processes
pm2 list
pm2 delete all    # Nuclear option — removes all PM2 processes
```

### Backend shows `errored` status in PM2

```bash
# Check the error logs
pm2 logs upicharge-backend --lines 50

# Common causes:
# 1. Missing .env file → create it
# 2. Missing Python packages → pip install them
# 3. Wrong uvicorn path → use `which uvicorn` to find the correct path
# 4. Port conflict → kill the process using the port
```

### Frontend build fails

```bash
cd ~/upiCHARGE/frontend

# Clear old build artifacts and caches
rm -rf .next node_modules

# Reinstall and rebuild
npm install
npm run build
```

### chargeMOD API returns 401/403

**Cause:** JWT token expired or invalid credentials.

**Fix:**
```bash
# Delete the cached token (it will auto-refresh on next request)
rm ~/upiCHARGE/data/token_cache.json
pm2 restart upicharge-backend
```

Verify your `USER_EMAIL` and `USER_PASSWORD` in `.env` are correct.

### Razorpay webhook not triggering

1. Check that the webhook URL is correct in Razorpay Dashboard: `https://yourdomain.com/api/payments/webhook`
2. Ensure HTTPS is working (webhooks require HTTPS).
3. Check that `RAZORPAY_WEBHOOK_SECRET` matches exactly between Razorpay Dashboard and your `.env`.
4. Check backend logs for webhook signature verification errors:
   ```bash
   pm2 logs upicharge-backend --lines 100 | grep -i webhook
   ```

### Nginx returns 502 Bad Gateway

**Cause:** The backend or frontend process is not running.

**Fix:**
```bash
pm2 status                     # Check if processes are online
pm2 restart all                # Restart all processes
sudo systemctl restart nginx   # Restart Nginx
```

---

## Security Notes

1. **`.env` Protection:** The `.env` file contains critical secrets (Razorpay keys, database credentials). Never commit it to git. Always create it manually on each deployment.

2. **Admin Dashboard:** The `/admin` route currently has no authentication. For production, you should:
   - Restrict access by IP in Nginx:
     ```nginx
     location /admin {
         allow YOUR_OFFICE_IP;
         deny all;
         proxy_pass http://127.0.0.1:3000;
     }
     ```
   - Or add HTTP basic auth:
     ```bash
     sudo apt install apache2-utils
     sudo htpasswd -c /etc/nginx/.htpasswd admin_user
     ```
     Then add to the Nginx location block:
     ```nginx
     location /admin {
         auth_basic "Admin Access";
         auth_basic_user_file /etc/nginx/.htpasswd;
         proxy_pass http://127.0.0.1:3000;
     }
     ```

3. **CORS:** The backend currently allows all origins (`allow_origins=["*"]`). In production, restrict this to your frontend domain only by editing `main.py`.

4. **Firewall:** Only expose ports 80 (HTTP), 443 (HTTPS), and 22 (SSH) in your AWS Security Group. Backend port 8000 and frontend port 3000 should NOT be directly accessible from the internet.

5. **Backups:** Regularly back up `data/transactions_db.json` — it's your financial ledger.
   ```bash
   # Example: daily backup to an S3 bucket
   aws s3 cp ~/upiCHARGE/data/transactions_db.json s3://your-backup-bucket/upicharge/transactions_$(date +%Y%m%d).json
   ```

---

## License

Proprietary. All rights reserved.

---

**Built with ❤️ by [AEYO Node](https://github.com/aeyo-node)** — Powering India's EV charging infrastructure.
