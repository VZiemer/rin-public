variable "firebase_secret_arn" {
  type     = string
  default  = null
  nullable = true
}
resource "aws_iam_role_policy" "firebase_secret" {
  count = var.firebase_secret_arn == null ? 0 : 1
  role  = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.firebase_secret_arn }
  ] })
}
variable "enable_debug_endpoints" {
  type    = bool
  default = false
}
resource "aws_apigatewayv2_route" "debug_notification" {
  count              = var.enable_debug_endpoints ? 1 : 0
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "AWS_IAM"
  route_key          = "POST /debug/notifications"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
