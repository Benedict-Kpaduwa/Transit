#!/usr/bin/env bash
# EC2 user-data for Amazon Linux 2023: installs Docker + compose and lays out
# /opt/calgary-transit. Paste into "User data" when launching the instance, or
# run once as root. Deployments are done by deploy.sh.
set -euxo pipefail

dnf install -y docker awscli
systemctl enable --now docker

mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-$(uname -m)" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

mkdir -p /opt/calgary-transit
# The workflow uploads docker-compose.yml, Caddyfile and deploy.sh on each
# deploy, so nothing else is needed here.
