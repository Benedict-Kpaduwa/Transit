# Deploying Calgary Transit on DigitalOcean

## Architecture

Single Docker container running **Nginx** (port 8080) + **FastAPI/Uvicorn** (port 8000), managed by **supervisord**.

- Nginx serves the frontend static files and proxies `/api/*` → FastAPI
- GitHub Actions CI/CD auto-deploys on push to `master`

## Prerequisites

- [DigitalOcean](https://cloud.digitalocean.com/) account
- [DigitalOcean Container Registry](https://docs.digitalocean.com/products/container-registry/) (DOCR) created
- GitHub repo: `Benedict-Kpaduwa/Transit`

## Setup

### 1. Create Container Registry

```bash
doctl registry create calgary-transit
```

### 2. Add GitHub Secrets

Go to **GitHub → Repo → Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|---|---|
| `DIGITALOCEAN_ACCESS_TOKEN` | DigitalOcean API token ([create here](https://cloud.digitalocean.com/account/api/tokens)) |
| `REGISTRY_NAME` | Your DOCR registry name (e.g. `calgary-transit`) |
| `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox GL access token |

### 3. Create App on DigitalOcean

```bash
doctl apps create --spec .do/app.yaml
```

Or via dashboard: **App Platform → Create App → Import from GitHub**.

### 4. Set Runtime Secrets in Dashboard

Go to **App Settings → Environment Variables** and set:

| Variable | Description |
|---|---|
| `CALGARY_APP_TOKEN` | Calgary Open Data API token |
| `MAPBOX_ACCESS_TOKEN` | Mapbox GL access token |
| `TRANSIT_API_KEY` | Transit App API key |
| `GOOGLE_API_KEY` | Google Directions API key |

### 5. Push to Deploy

Every push to `master` triggers the CI/CD pipeline:

```
Push → GitHub Actions → Build Image → Push to DOCR → Redeploy App
```

## Local Development

```bash
# Run backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Run frontend (separate terminal)
cd frontend && pnpm install && pnpm dev
```

## Local Docker Build

```bash
docker build --build-arg VITE_MAPBOX_ACCESS_TOKEN=your_token -t calgary-transit .
docker run -p 8080:8080 --env-file backend/.env calgary-transit
# Visit http://localhost:8080
```

## Custom Domain

1. Go to **App Settings → Domains**
2. Add your domain and follow the DNS instructions
3. SSL is provisioned automatically

## Useful Commands

```bash
doctl apps list                              # List apps
doctl apps logs <app-id> --type run          # View logs
doctl apps list-deployments <app-id>         # List deployments
doctl apps create-deployment <app-id>        # Force redeploy
```
