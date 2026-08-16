# Infrastructure

Terraform configuration for Samezario AWS infrastructure.

## Target Architecture

- Frontend: `S3 + CloudFront`
- Backend: `ALB -> ECS on Fargate`
- Image registry: `ECR`
- Shared state: `ElastiCache Redis`
- GPS tracking: `Amazon Location Service Tracker`

## Room Model

- Each ECS task owns one independent room.
- The ECS service keeps `2` tasks running by default.
- ALB distributes new connections across tasks, so each task becomes a separate room.
- A room stays local to its task memory for the PoC.
- Redis is reserved for session, leaderboard, GPS/CP state, and future room registry use.

## Layout

```text
infra/
  envs/dev/              # deployable environment
  modules/network/       # VPC, subnets, routes
  modules/ecr/           # ECR repositories
  modules/alb/           # ALB, target group, listeners
  modules/ecs_service/   # ECS cluster, task definition, service
  modules/redis/         # ElastiCache Redis
  modules/frontend_static/ # S3 + CloudFront
  modules/location/      # Amazon Location tracker
```

## Prerequisites

- AWS CLI configured with appropriate credentials
- Terraform 1.0+ installed
- Docker installed (for building and pushing images to ECR)

## Quick Start

### 1. Configure Variables

Copy the example tfvars file:
```bash
cd envs/dev
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your settings:
```hcl
aws_region      = "us-east-1"
aws_account_id  = "123456789012"
project_name    = "samezario"
environment     = "dev"
# ... other variables
```

### 2. Initialize Terraform

```bash
cd envs/dev
terraform init
```

### 3. Plan Infrastructure

```bash
terraform plan -out=tfplan
```

Review the planned changes carefully.

### 4. Apply Infrastructure

```bash
terraform apply tfplan
```

### 5. Build and Push Docker Image

After infrastructure is created:
```bash
# Get ECR login
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build and push from project root
cd ../..
docker build -t samezario:latest .
docker tag samezario:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/samezario:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/samezario:latest
```

### 6. Update ECS Service

Force new deployment to use the new image:
```bash
aws ecs update-service \
  --cluster samezario-dev \
  --service samezario-service \
  --force-new-deployment \
  --region us-east-1
```

## Initial Deployment Order

1. ACM certificate and Route53 zone inputs
2. Network
3. ECR
4. ALB
5. ECS service
6. Redis
7. Frontend static hosting
8. Amazon Location tracker

## Notes

- The ECS service starts with `desired_count = 2`.
- `min_capacity = 2` keeps two rooms warm by default.
- Auto scaling is enabled structurally, but bounded conservatively for PoC.
- WebSocket TLS terminates at the ALB.
- GPS/CP calculation should remain server-authoritative.
- Each task derives its default room ID from the container hostname unless `ROOM_ID` is set explicitly.
