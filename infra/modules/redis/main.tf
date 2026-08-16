resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name_prefix}-redis-subnet-group"
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = replace("${var.name_prefix}-redis", "_", "-")
  description                = "Redis for ${var.name_prefix}"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = var.node_type
  num_cache_clusters         = 1
  parameter_group_name       = "default.redis7"
  port                       = 6379
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [var.security_group_id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  automatic_failover_enabled = false
}
