resource "aws_s3_bucket" "rin_assets" {
  bucket        = "rin-${var.environment}-${data.aws_caller_identity.proactive_tick.account_id}-assets"
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "rin_assets" {
  bucket                  = aws_s3_bucket.rin_assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "rin_assets" {
  bucket = aws_s3_bucket.rin_assets.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_policy" "rin_assets" {
  bucket = aws_s3_bucket.rin_assets.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    {
      Sid       = "RequireTLS", Effect = "Deny", Principal = "*", Action = "s3:*",
      Resource  = [aws_s3_bucket.rin_assets.arn, "${aws_s3_bucket.rin_assets.arn}/*"],
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    },
    {
      Sid      = "RequireImmutableUpload", Effect = "Deny", Principal = "*", Action = "s3:PutObject",
      Resource = "${aws_s3_bucket.rin_assets.arn}/assistants/*",
      Condition = {
        Null = { "s3:if-none-match" = "true" },
        Bool = { "s3:ObjectCreationOperation" = "true" }
      }
    }
  ] })
  depends_on = [aws_s3_bucket_public_access_block.rin_assets]
}
resource "aws_iam_role_policy" "api_rin_assets" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.rin_assets.arn}/assistants/*" }
  ] })
}
resource "aws_cloudwatch_log_group" "rin_assets" {
  name              = "/aws/lambda/rin-${var.environment}-assets"
  retention_in_days = 14
}
resource "aws_iam_role" "rin_assets" {
  name = "rin-${var.environment}-assets"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }
  ] })
}
resource "aws_iam_role_policy" "rin_assets" {
  role = aws_iam_role.rin_assets.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.rin_assets.arn}:*" },
    {
      Effect    = "Allow", Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:DeleteItem"],
      Resource  = aws_dynamodb_table.data.arn,
      Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["ASSISTANT#*", "USER#*", "DEVICE#*"] } }
    },
    { Effect = "Allow", Action = ["dynamodb:Scan"], Resource = aws_dynamodb_table.data.arn },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.rin_assets.arn}/assistants/*" }
    ], var.firebase_secret_arn == null ? [] : [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.firebase_secret_arn }
  ]) })
}
resource "aws_lambda_function" "rin_assets" {
  function_name    = "rin-${var.environment}-assets"
  role             = aws_iam_role.rin_assets.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "rin-assets.handler"
  filename         = "${path.module}/../../../../dist/rin-assets.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/rin-assets.zip")
  timeout          = 120
  memory_size      = 256
  environment {
    variables = merge({
      APP_ENV                  = var.environment
      TABLE_NAME               = aws_dynamodb_table.data.name
      ASSET_BUCKET_NAME        = aws_s3_bucket.rin_assets.id
      ASSET_ONBOARDING_ENABLED = tostring(var.enable_asset_onboarding)
      INTERNAL_USER_ID         = var.internal_user_id
      ASSET_CATALOG_BASE_URL   = "${aws_apigatewayv2_api.api.api_endpoint}/assistants"
      TIMEZONE                 = var.timezone
    }, var.firebase_secret_arn == null ? {} : { FIREBASE_SECRET_ARN = var.firebase_secret_arn })
  }
  depends_on = [aws_cloudwatch_log_group.rin_assets, aws_iam_role_policy.rin_assets, aws_s3_bucket_policy.rin_assets]
}
resource "aws_lambda_function_event_invoke_config" "rin_assets" {
  function_name                = aws_lambda_function.rin_assets.function_name
  maximum_event_age_in_seconds = 300
  maximum_retry_attempts       = 0
}
resource "aws_apigatewayv2_route" "rin_assets" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "GET /rin/assets"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
resource "aws_apigatewayv2_route" "assistant_assets" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "GET /assistants/{assistantId}/assets"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
output "rin_assets" {
  value = {
    bucket               = aws_s3_bucket.rin_assets.id
    lambda               = aws_lambda_function.rin_assets.function_name
    catalog_url          = "${aws_apigatewayv2_api.api.api_endpoint}/assistants/RIN/assets"
    catalog_url_template = "${aws_apigatewayv2_api.api.api_endpoint}/assistants/{assistantId}/assets"
    notification         = "avatar_image_available"
    selection            = "avatar_image_select"
    schedule             = aws_scheduler_schedule.rin_assets.name
  }
}
resource "aws_scheduler_schedule_group" "rin_assets" {
  name = "rin-${var.environment}-assets"
}
resource "aws_iam_role" "rin_assets_scheduler" {
  name = "rin-${var.environment}-assets-scheduler"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole",
    Condition = {
      StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.proactive_tick.account_id },
      ArnEquals    = { "aws:SourceArn" = aws_scheduler_schedule_group.rin_assets.arn }
    }
  }] })
}
resource "aws_iam_role_policy" "rin_assets_scheduler" {
  role = aws_iam_role.rin_assets_scheduler.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.rin_assets.arn
  }] })
}
resource "aws_scheduler_schedule" "rin_assets" {
  name                         = "rin-${var.environment}-assets"
  group_name                   = aws_scheduler_schedule_group.rin_assets.name
  description                  = "Select assistant avatars at calendar/time boundaries and refresh active download URLs."
  schedule_expression          = "cron(0/5 * * * ? *)"
  schedule_expression_timezone = var.timezone
  state                        = "ENABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.rin_assets.arn
    role_arn = aws_iam_role.rin_assets_scheduler.arn
    input    = jsonencode({ operation = "sync" })
    retry_policy {
      maximum_event_age_in_seconds = 60
      maximum_retry_attempts       = 0
    }
  }
  depends_on = [aws_iam_role_policy.rin_assets_scheduler, aws_lambda_function_event_invoke_config.rin_assets]
}
