variable "enable_asset_onboarding" {
  type        = bool
  default     = false
  description = "Ask only the configured developer for new RIN image usage rules."
  validation {
    condition = !var.enable_asset_onboarding || (
      var.environment == "dev" && var.model_provider == "bedrock" && var.firebase_secret_arn != null &&
      can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[17][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", var.internal_user_id))
    )
    error_message = "Asset onboarding requires dev, Bedrock, Firebase and the developer's internal UUID."
  }
}
resource "aws_cloudwatch_log_group" "asset_upload" {
  name              = "/aws/lambda/rin-${var.environment}-asset-upload"
  retention_in_days = 14
}
resource "aws_sqs_queue" "asset_upload_failures" {
  name                      = "rin-${var.environment}-asset-upload-failures"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_iam_role" "asset_upload" {
  name = "rin-${var.environment}-asset-upload"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }
  ] })
}
resource "aws_iam_role_policy" "asset_upload" {
  role = aws_iam_role.asset_upload.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.asset_upload.arn}:*" },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.rin_assets.arn}/assistants/RIN/*" },
    {
      Effect    = "Allow", Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem"], Resource = aws_dynamodb_table.data.arn,
      Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["USER#${var.internal_user_id}", "ASSISTANT#RIN", "DEVICE#*"] } }
    },
    { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.asset_upload_failures.arn }
    ], var.firebase_secret_arn == null ? [] : [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.firebase_secret_arn }
  ]) })
}
resource "aws_lambda_function" "asset_upload" {
  function_name    = "rin-${var.environment}-asset-upload"
  role             = aws_iam_role.asset_upload.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "asset-upload.handler"
  filename         = "${path.module}/../../../../dist/asset-upload.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/asset-upload.zip")
  timeout          = 120
  memory_size      = 256
  environment {
    variables = merge({
      APP_ENV                  = var.environment
      TABLE_NAME               = aws_dynamodb_table.data.name
      ASSET_BUCKET_NAME        = aws_s3_bucket.rin_assets.id
      ASSET_ONBOARDING_ENABLED = tostring(var.enable_asset_onboarding)
      INTERNAL_USER_ID         = var.internal_user_id
    }, var.firebase_secret_arn == null ? {} : { FIREBASE_SECRET_ARN = var.firebase_secret_arn })
  }
  depends_on = [aws_cloudwatch_log_group.asset_upload, aws_iam_role_policy.asset_upload]
}
resource "aws_lambda_function_event_invoke_config" "asset_upload" {
  function_name                = aws_lambda_function.asset_upload.function_name
  maximum_event_age_in_seconds = 3600
  maximum_retry_attempts       = 2
  destination_config {
    on_failure { destination = aws_sqs_queue.asset_upload_failures.arn }
  }
}
resource "aws_lambda_permission" "asset_upload_s3" {
  statement_id   = "AllowAssetBucket"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.asset_upload.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.rin_assets.arn
  source_account = data.aws_caller_identity.proactive_tick.account_id
}
resource "aws_s3_bucket_notification" "rin_assets" {
  bucket = aws_s3_bucket.rin_assets.id
  dynamic "lambda_function" {
    for_each = var.enable_asset_onboarding ? [1] : []
    content {
      lambda_function_arn = aws_lambda_function.asset_upload.arn
      events              = ["s3:ObjectCreated:*"]
      filter_prefix       = "assistants/RIN/"
    }
  }
  depends_on = [aws_lambda_permission.asset_upload_s3, aws_lambda_function_event_invoke_config.asset_upload]
}
output "asset_onboarding" {
  value = {
    enabled       = var.enable_asset_onboarding
    lambda        = aws_lambda_function.asset_upload.function_name
    failure_queue = aws_sqs_queue.asset_upload_failures.name
    upload_prefix = "assistants/RIN/"
  }
}
