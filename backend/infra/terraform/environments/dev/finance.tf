variable "enable_statement_imports" {
  type    = bool
  default = false
}
resource "aws_s3_bucket" "finance" {
  bucket        = "rin-${var.environment}-${data.aws_caller_identity.proactive_tick.account_id}-finance"
  force_destroy = false
}
resource "aws_s3_bucket_public_access_block" "finance" {
  bucket                  = aws_s3_bucket.finance.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "finance" {
  bucket = aws_s3_bucket.finance.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_lifecycle_configuration" "finance" {
  bucket = aws_s3_bucket.finance.id
  rule {
    id     = "delete-original-statements"
    status = "Enabled"
    filter { prefix = "statements/" }
    expiration { days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}
resource "aws_s3_bucket_policy" "finance" {
  bucket = aws_s3_bucket.finance.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.finance.arn, "${aws_s3_bucket.finance.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } },
    { Effect = "Deny", Principal = "*", Action = "s3:PutObject", Resource = "${aws_s3_bucket.finance.arn}/statements/*", Condition = { Null = { "s3:if-none-match" = "true" }, Bool = { "s3:ObjectCreationOperation" = "true" } } }
  ] })
  depends_on = [aws_s3_bucket_public_access_block.finance]
}
resource "aws_iam_role_policy" "api_finance_upload" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:PutObject"], Resource = "${aws_s3_bucket.finance.arn}/statements/*" }
  ] })
}
resource "aws_cloudwatch_log_group" "finance_import" {
  name              = "/aws/lambda/rin-${var.environment}-finance-import"
  retention_in_days = 14
}
resource "aws_sqs_queue" "finance_import_failures" {
  name                      = "rin-${var.environment}-finance-import-failures"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}
resource "aws_iam_role" "finance_import" {
  name               = "rin-${var.environment}-finance-import"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy" "finance_import" {
  role = aws_iam_role.finance_import.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.finance_import.arn}:*" },
    { Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.finance.arn}/statements/*" },
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem"], Resource = aws_dynamodb_table.data.arn, Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["USER#*"] } } },
    { Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.finance_import_failures.arn }
  ] })
}
resource "aws_lambda_function" "finance_import" {
  function_name    = "rin-${var.environment}-finance-import"
  role             = aws_iam_role.finance_import.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "finance-import.handler"
  filename         = "${path.module}/../../../../dist/finance-import.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/finance-import.zip")
  timeout          = 180
  memory_size      = 512
  environment {
    variables = {
      APP_ENV                 = var.environment
      TABLE_NAME              = aws_dynamodb_table.data.name
      FINANCE_BUCKET_NAME     = aws_s3_bucket.finance.id
      FINANCE_IMPORTS_ENABLED = tostring(var.enable_statement_imports)
    }
  }
  depends_on = [aws_cloudwatch_log_group.finance_import, aws_iam_role_policy.finance_import]
}
resource "aws_lambda_function_event_invoke_config" "finance_import" {
  function_name                = aws_lambda_function.finance_import.function_name
  maximum_event_age_in_seconds = 3600
  maximum_retry_attempts       = 2
  destination_config {
    on_failure { destination = aws_sqs_queue.finance_import_failures.arn }
  }
}
resource "aws_lambda_permission" "finance_import_s3" {
  statement_id   = "AllowFinanceBucket"
  action         = "lambda:InvokeFunction"
  function_name  = aws_lambda_function.finance_import.function_name
  principal      = "s3.amazonaws.com"
  source_arn     = aws_s3_bucket.finance.arn
  source_account = data.aws_caller_identity.proactive_tick.account_id
}
resource "aws_s3_bucket_notification" "finance" {
  bucket = aws_s3_bucket.finance.id
  dynamic "lambda_function" {
    for_each = var.enable_statement_imports ? [1] : []
    content {
      lambda_function_arn = aws_lambda_function.finance_import.arn
      events              = ["s3:ObjectCreated:*"]
      filter_prefix       = "statements/"
    }
  }
  depends_on = [aws_lambda_permission.finance_import_s3, aws_lambda_function_event_invoke_config.finance_import]
}
resource "aws_apigatewayv2_route" "finance" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "ANY /assistants/{assistantId}/finance/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
output "finance_import" {
  value = { enabled = var.enable_statement_imports, bucket = aws_s3_bucket.finance.id, lambda = aws_lambda_function.finance_import.function_name, failure_queue = aws_sqs_queue.finance_import_failures.name }
}
