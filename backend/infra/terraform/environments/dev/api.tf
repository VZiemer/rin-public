resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/rin-${var.environment}-api"
  retention_in_days = 14
}
resource "aws_iam_role" "api" {
  name               = "rin-${var.environment}-api"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "api" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.api.arn}:*" }
  ] })
}
resource "aws_lambda_function" "api" {
  function_name    = "rin-${var.environment}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = "${path.module}/../../../../dist/api.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/api.zip")
  timeout          = 28
  memory_size      = 256
  environment {
    variables = merge({
      MODEL_PROVIDER                 = var.model_provider
      OPENAI_MODEL_ID                = var.openai_model_id
      BEHAVIOR_FEEDBACK_ENABLED      = tostring(local.behavior_evolution_enabled)
      BEHAVIOR_FEEDBACK_FUNCTION_ARN = aws_lambda_function.behavior_feedback.arn
      BEDROCK_MODEL_ID               = var.bedrock_model_id
      BEDROCK_OPENAI_MODEL_ID        = var.bedrock_openai_model_id
      ENABLE_DEBUG_ENDPOINTS         = tostring(var.enable_debug_endpoints)
      APP_ENV                        = var.environment
      TABLE_NAME                     = aws_dynamodb_table.data.name
      ASSET_BUCKET_NAME              = aws_s3_bucket.rin_assets.id
      FINANCE_BUCKET_NAME            = aws_s3_bucket.finance.id
      FINANCE_IMPORTS_ENABLED        = tostring(var.enable_statement_imports)
      ASSET_ONBOARDING_ENABLED       = tostring(var.enable_asset_onboarding)
      INTERNAL_USER_ID               = var.internal_user_id
      TIMEZONE                       = var.timezone
      DEV_USER_ID                    = var.dev_user_id
      COGNITO_ISSUER                 = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.app.id}"
      COGNITO_AUDIENCE               = aws_cognito_user_pool_client.android.id
      }, var.firebase_secret_arn == null ? {} : { FIREBASE_SECRET_ARN = var.firebase_secret_arn },
      var.agent_model_provider == null ? {} : { AGENT_MODEL_PROVIDER = var.agent_model_provider },
      var.agent_bedrock_model_id == null ? {} : { AGENT_BEDROCK_MODEL_ID = var.agent_bedrock_model_id },
    var.openai_secret_arn == null ? {} : { OPENAI_SECRET_ARN = var.openai_secret_arn })
  }
  lifecycle {
    precondition {
      condition     = var.agent_model_provider != "openai" || var.openai_secret_arn != null
      error_message = "OpenAI chat requires an existing openai_secret_arn."
    }
  }
  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.api, aws_iam_role_policy.data, aws_iam_role_policy.model, aws_iam_role_policy.agent_bedrock_model, aws_iam_role_policy.bedrock_openai, aws_iam_role_policy.openai_secret, aws_iam_role_policy.firebase_secret, aws_iam_role_policy.api_rin_assets, aws_iam_role_policy.api_behavior_feedback, aws_lambda_function_event_invoke_config.behavior_feedback, aws_iam_role_policy.api_finance_upload]
}
resource "aws_apigatewayv2_api" "api" {
  name          = "rin-${var.environment}-api"
  protocol_type = "HTTP"
}
resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}
resource "aws_apigatewayv2_stage" "dev" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}
resource "aws_lambda_permission" "api" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
variable "dev_user_id" {
  type    = string
  default = "dev-user"
}
variable "internal_user_id" {
  type    = string
  default = ""
}
output "api_url" {
  value = aws_apigatewayv2_api.api.api_endpoint
}
