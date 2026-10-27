# Shop microservices starter

A small TypeScript/Fastify monorepo for an online shop, with four independently
containerized services, each with its own Dockerfile:

- **catalog** — product catalog boundary
- **customers** — customer profile boundary
- **orders** — order management boundary
- **notifications** — customer notification boundary

Each service has its own Helm-managed Deployment and ClusterIP Service. They
use one PostgreSQL database cluster; use a separate PostgreSQL schema (and, for
stronger isolation, a distinct database role) for each service. The starter
exposes `/`, `/health/live`, and `/health/ready`; it intentionally leaves
business routes and database migrations for the application-specific next step.

## Run locally

Requirements: Node.js 22+, npm, and Docker Compose.

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Check the services at `http://localhost:3001` through `http://localhost:3004`.
For example:

```powershell
Invoke-RestMethod http://localhost:3001/health/ready
```

Stop with `docker compose down`. To remove the local database volume as well,
use `docker compose down --volumes`.

For code-only checks:

```powershell
npm ci
npm run typecheck
npm run build
```

## Deploy to AWS

The Terraform configuration creates a VPC, an EKS cluster with a small managed
node group, a private RDS PostgreSQL instance, four immutable ECR repositories,
and a GitHub Actions OIDC deployment role. It is a starter configuration, not a
zero-cost setup: NAT gateways, EKS, and RDS incur ongoing charges. Review AWS
pricing, limits, and the Terraform plan before applying.

1. Install Terraform 1.6+ and configure AWS credentials locally with permission
   to create the resources. Choose the AWS region and edit
   `infra/terraform/terraform.tfvars.example`, then save your own values as
   `infra/terraform/terraform.tfvars` (this file is git-ignored).
2. Before production, configure a secure remote Terraform backend with encryption,
   access controls, and state locking. The RDS master password is managed by AWS
   Secrets Manager, but Terraform state and plans must still be protected.
3. Check that the GitHub OIDC provider thumbprint in `variables.tf` is current.
   The EKS endpoint permits `cluster_endpoint_public_access_cidrs`; restrict it
   to a fixed-IP runner, VPN, or other trusted CIDR. The default allows network
   access from anywhere but still requires AWS IAM authentication.
4. Run from `infra/terraform`:

   ```powershell
   terraform init
   terraform plan -out=tfplan
   terraform apply tfplan
   ```

5. In GitHub repository **Settings → Secrets and variables → Actions → Variables**,
   add `AWS_REGION`, `EKS_CLUSTER_NAME`, `AWS_DEPLOY_ROLE_ARN`, and `DB_SECRET_ARN`
   using the matching Terraform outputs. No long-lived AWS access key is needed;
   the workflow assumes the role with GitHub OIDC.
6. Push to `main`. Pull requests run type-check/build validation. A push to
   `main` builds and pushes each service image with that service's Dockerfile,
   loads the RDS master secret into the `shop` Kubernetes namespace, and deploys
   or upgrades the `shop` Helm release from `helm/shop`. If resources from the
   earlier plain-manifest deployment exist, the workflow adopts them into Helm
   while keeping their existing service selectors. It waits for the release to
   become ready.

To render or validate the chart locally, install Helm 3 and run:

```powershell
helm lint .\helm\shop --set-string image.registry=example.dkr.ecr.us-east-1.amazonaws.com --set-string image.tag=local
helm template shop .\helm\shop --namespace shop --set-string image.registry=example.dkr.ecr.us-east-1.amazonaws.com --set-string image.tag=local
```

The workflow deploys to an internal cluster service only. To expose public
traffic, install and configure AWS Load Balancer Controller, then add an ALB
Ingress and TLS/DNS configuration appropriate to your domain. Do not expose
individual service endpoints publicly by default.

## Before production

- Replace the starter service descriptions with APIs and business logic; add
  versioned database migrations and automated tests.
- Give each service a distinct database role with access only to its own schema.
  The current RDS master credential is convenient for bootstrapping but grants
  excessive privileges to application pods.
- Move secret synchronization from the GitHub runner into the cluster, such as
  with AWS Secrets Manager and External Secrets Operator/Pod Identity.
- Add an API gateway/ingress, authentication and authorization, TLS, observability,
  backups, resource/cost policies, and a controlled release/rollback strategy.
- Pin third-party GitHub Actions to reviewed commit SHAs and scan dependencies
  and container images according to your organization's policy.

## Layout

```text
packages/common/       Shared Fastify bootstrap and PostgreSQL readiness check
services/              Four independent service entry points and Dockerfiles
helm/shop/             Helm chart for all services and internal Services
infra/terraform/       AWS network, EKS, RDS, ECR, and GitHub OIDC role
.github/workflows/     Validation, image build/push, and deployment pipeline
```
