resource "aws_dynamodb_table" "data" {
  name         = "rin-${var.environment}-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"
  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
  point_in_time_recovery {
    enabled = var.enable_pitr
  }
  server_side_encryption {
    enabled = true
  }
}
variable "enable_pitr" {
  type    = bool
  default = true
}
output "table_name" {
  value = aws_dynamodb_table.data.name
}
