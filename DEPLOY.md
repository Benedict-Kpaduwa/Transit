# Deploying Calgary Transit on DigitalOcean App Platform

## Prerequisites

- A [DigitalOcean](https://cloud.digitalocean.com/) account
- Your GitHub repo pushed to **Benedict-Kpaduwa/Transit**
- API keys ready (see `.env.example` files)

## Deploy

### Option 1 — Via Dashboard (Recommended)

1. Go to **DigitalOcean → App Platform → Create App**
2. Connect your GitHub repo (`Benedict-Kpaduwa/Transit`)
3. DO will auto-detect `.do/app.yaml` — confirm the spec
4. Set environment variables in the dashboard:

   **Backend (calgary-transit-api):**
   | Variable | Description |
   |---|---|
   | `CALGARY_APP_TOKEN` | Calgary Open Data API token |
   | `MAPBOX_ACCESS_TOKEN` | Mapbox GL access token |
   | `TRANSIT_API_KEY` | Transit App API key |
   | `GOOGLE_API_KEY` | Google Directions API key |

   **Frontend (calgary-transit-web):**
   | Variable | Description |
   |---|---|
   | `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox GL access token |
   | `VITE_API_BASE_URL` | Auto-set from backend URL |

5. Click **Create Resources** — deploy takes ~5 minutes

### Option 2 — Via CLI

```bash
# Install doctl
brew install doctl

# Authenticate
doctl auth init

# Create the app from the spec
doctl apps create --spec .do/app.yaml

# Set secrets (replace with your actual values)
doctl apps update <app-id> --spec .do/app.yaml
```

## Custom Domain

1. Go to **App Settings → Domains**
2. Add your domain and follow the DNS instructions
3. SSL is provisioned automatically by DigitalOcean

## Architecture

```
┌─────────────────────────────────────────────┐
│           DigitalOcean App Platform         │
│                                             │
│  ┌──────────────────┐  ┌────────────────┐   │
│  │ calgary-transit-  │  │ calgary-transit │   │
│  │ api (Docker)      │  │ -web (Static)   │   │
│  │                   │  │                 │   │
│  │ FastAPI + GTFS    │←─│ Vite + React    │   │
│  │ Port 8000         │  │ pnpm build      │   │
│  └──────────────────┘  └────────────────┘   │
└─────────────────────────────────────────────┘
```

## Useful Commands

```bash
# View app logs
doctl apps logs <app-id> --type run

# List deployments
doctl apps list-deployments <app-id>

# Force redeploy
doctl apps create-deployment <app-id>
```
