#!/usr/bin/env bash
# Pull the given image and (re)start the stack. Run on the EC2 instance,
# normally via SSM Run Command from GitHub Actions.
#
# Usage: deploy.sh <image-uri>
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image-uri>}"
APP_DIR=/opt/calgary-transit
SSM_PREFIX=/calgary-transit
REGION="$(curl -fsS -H "X-aws-ec2-metadata-token: $(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60')" http://169.254.169.254/latest/meta-data/placement/region)"

cd "$APP_DIR"

# Runtime secrets from SSM Parameter Store -> .env (KEY=value)
umask 077
aws ssm get-parameters-by-path --region "$REGION" --path "$SSM_PREFIX/" --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text \
  | awk -F'\t' -v p="$SSM_PREFIX/" '{sub(p, "", $1); print $1 "=" $2}' > .env.new
mv .env.new .env

DOMAIN="$(grep '^DOMAIN=' .env | cut -d= -f2-)"
sed -i '/^DOMAIN=/d' .env
echo "IMAGE=$IMAGE" > .compose.env
echo "DOMAIN=$DOMAIN" >> .compose.env

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${IMAGE%%/*}"

docker compose --env-file .compose.env pull
docker compose --env-file .compose.env up -d --remove-orphans
docker image prune -f
