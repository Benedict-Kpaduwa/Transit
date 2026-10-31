# Deploying Calgary Transit on AWS EC2

## Architecture

```
Internet ─▶ Caddy (80/443, auto-HTTPS) ─▶ app container (Nginx :8080 + FastAPI :8000)
```

- One EC2 instance (Amazon Linux 2023) runs `docker compose` with two containers: **Caddy** (TLS) and the **app** image (Nginx + FastAPI under supervisord, see `Dockerfile`).
- Images live in **ECR**. Runtime secrets live in **SSM Parameter Store** under `/calgary-transit/`.
- GitHub Actions builds, pushes to ECR, then runs `deploy/deploy.sh` on the instance through **SSM Run Command** (no SSH, no long-lived AWS keys — it assumes an IAM role via OIDC).

## One-time AWS setup

Replace `REGION` / `ACCOUNT_ID` / `DOMAIN` throughout.

### 1. ECR repository

```bash
aws ecr create-repository --repository-name calgary-transit --region REGION
```

### 2. Secrets in Parameter Store

```bash
for k in CALGARY_APP_TOKEN MAPBOX_ACCESS_TOKEN TRANSIT_API_KEY GOOGLE_API_KEY; do
  aws ssm put-parameter --region REGION --type SecureString --name /calgary-transit/$k --value "..."
done
aws ssm put-parameter --region REGION --type String --name /calgary-transit/DOMAIN --value "transit.example.com"
```

**No domain yet?** Use `:80` as the `DOMAIN` value. Caddy then serves plain HTTP on the Elastic IP (`http://ELASTIC_IP`). The iOS app requires HTTPS, so it can't use this until you add a domain: change the parameter to your domain, point its `A` record at the Elastic IP, and redeploy.

### 3. Instance role

Create an IAM role for EC2 with:
- managed policy `AmazonSSMManagedInstanceCore`
- managed policy `AmazonEC2ContainerRegistryReadOnly`
- inline policy allowing `ssm:GetParametersByPath` on `arn:aws:ssm:REGION:ACCOUNT_ID:parameter/calgary-transit/*` (and `kms:Decrypt` if you use a custom key)

### 4. Launch the instance

- AMI: Amazon Linux 2023, type `t3.small` (2 GB; the GTFS indexes need memory — `t3.micro` is likely too small)
- Instance profile: the role above
- Security group: inbound 80 and 443 from anywhere. **No port 22 needed.**
- User data: contents of `deploy/bootstrap.sh`
- Allocate an **Elastic IP** and associate it, then point your domain's `A` record at it (Caddy needs this to issue the certificate).

### 5. GitHub OIDC role for deploys

Create the GitHub OIDC provider (`token.actions.githubusercontent.com`, audience `sts.amazonaws.com`) and an IAM role trusting `repo:Benedict-Kpaduwa/Transit:ref:refs/heads/master`, with permissions for:
- ECR push (`ecr:GetAuthorizationToken`, plus `BatchCheckLayerAvailability`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `PutImage`, `BatchGetImage`, `GetDownloadUrlForLayer` on the repository)
- `ssm:SendCommand` on the instance and the `AWS-RunShellScript` document, plus `ssm:GetCommandInvocation` / `ssm:ListCommandInvocations`

### 6. GitHub configuration

Repo → Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|---|---|---|
| Secret | `AWS_ROLE_ARN` | ARN of the OIDC role |
| Secret | `VITE_MAPBOX_ACCESS_TOKEN` | Mapbox GL token (baked in at build) |
| Variable | `AWS_REGION` | e.g. `ca-central-1` |
| Variable | `EC2_INSTANCE_ID` | e.g. `i-0123456789abcdef0` |

Remove the old `DIGITALOCEAN_ACCESS_TOKEN` and `REGISTRY_NAME` secrets.

## Deploying

Push to `master`: `CI → build image → push to ECR → SSM runs deploy.sh → docker compose up -d`.
The first deploy also installs the compose file and Caddyfile on the instance.

## Cutover from DigitalOcean

1. Complete the setup above and let one deploy succeed; verify with `curl https://DOMAIN/api/health` (or the Elastic IP with `--resolve`).
2. Lower the DNS TTL, switch the `A` record to the Elastic IP.
3. Update `API_BASE_URL` (Release) in `ios/project.yml` to `https://DOMAIN/api` and ship an app build. Keep the DigitalOcean app running until old app versions are gone.
4. Destroy the DigitalOcean app and registry (`doctl apps delete <id>`, `doctl registry delete calgary-transit`).

## Local Docker Build

```bash
docker build --build-arg VITE_MAPBOX_ACCESS_TOKEN=your_token -t calgary-transit .
docker run -p 8080:8080 --env-file backend/.env calgary-transit
# Visit http://localhost:8080
```

## Operations

```bash
aws ssm start-session --target i-XXXX          # shell on the instance (needs session-manager-plugin)
cd /opt/calgary-transit
docker compose --env-file .compose.env logs -f app
docker compose --env-file .compose.env ps
```

Rollback: re-run `bash /opt/calgary-transit/deploy.sh <ecr-uri>:<previous-sha>`.
