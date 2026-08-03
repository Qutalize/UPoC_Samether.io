variable "name_prefix" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "service_security_group_id" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "target_group_arn" {
  type = string
}

variable "container_image" {
  type = string
}

variable "container_port" {
  type = number
}

variable "cpu" {
  type = number
}

variable "memory" {
  type = number
}

variable "desired_count" {
  type = number
}

variable "min_capacity" {
  type = number
}

variable "max_capacity" {
  type = number
}

variable "room_capacity" {
  type = number
}

variable "redis_primary_endpoint" {
  type = string
}

variable "location_tracker_name" {
  type = string
}

variable "location_map_name" {
  type    = string
  default = ""
}

variable "location_map_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "allowed_origin" {
  type    = string
  default = ""
}
