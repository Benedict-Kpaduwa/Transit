# ── Stage 1: Build Frontend ──
FROM node:20-slim AS frontend-build

WORKDIR /frontend

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .

ARG VITE_MAPBOX_ACCESS_TOKEN
ARG VITE_API_BASE_URL=/api
ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN pnpm run build

# ── Stage 2: Runtime (Python + Nginx + Supervisor) ──
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Backend dependencies
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ .

# Frontend build artifacts → Nginx document root
COPY --from=frontend-build /frontend/dist /var/www/html

# Nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -f /etc/nginx/sites-enabled/default

# Supervisor config
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Non-root user (DigitalOcean best practice)
RUN useradd --create-home appuser \
    && chown -R appuser:appuser /app \
    && chown -R appuser:appuser /var/www/html \
    && chown -R appuser:appuser /var/log/nginx \
    && chown -R appuser:appuser /var/lib/nginx \
    && chown -R appuser:appuser /run \
    && chown -R appuser:appuser /var/log/supervisor

USER appuser

EXPOSE 8080

CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
