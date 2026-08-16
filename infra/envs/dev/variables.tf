variable "project_name" {
  description = "Project name prefix."
  type        = string
  default     = "samether"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region."
  type        = string
  default     = "ap-northeast-1"
}

variable "availability_zones" {
  description = "Availability zones used for the VPC."
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "allowed_origin" {
  description = "Allowed origin for CORS (e.g. https://xxxx.cloudfront.net)."
  type        = string
  default     = ""
}

variable "container_image" {
  description = "Full container image URI for the game server."
  type        = string
  default     = "public.ecr.aws/docker/library/nginx:stable"
}

variable "container_port" {
  description = "Backend container port."
  type        = number
  default     = 8080
}

variable "ecs_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "ecs_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Initial ECS desired count."
  type        = number
  default     = 2
}

variable "min_capacity" {
  description = "Minimum ECS service capacity."
  type        = number
  default     = 2
}

variable "max_capacity" {
  description = "Maximum ECS service capacity."
  type        = number
  default     = 4
}

variable "room_capacity" {
  description = "Maximum players allowed per task-local room."
  type        = number
  default     = 50
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "location_tracker_name" {
  description = "Amazon Location tracker name."
  type        = string
  default     = "samether-dev-tracker"
}

variable "location_map_name" {
  description = "Amazon Location map name."
  type        = string
  default     = "samether-dev-map"
}

variable "location_map_api_key" {
  description = "Amazon Location Maps API key for client-side map rendering."
  type        = string
  sensitive   = true
  default     = ""
}
