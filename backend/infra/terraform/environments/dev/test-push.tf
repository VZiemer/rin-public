variable "enable_test_push_schedule" {
  type    = bool
  default = false
}
variable "test_push_device_id" {
  type    = string
  default = "android-test"
  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,128}$", var.test_push_device_id))
    error_message = "Use a valid device ID."
  }
}
data "aws_caller_identity" "test_push" {}
resource "aws_cloudwatch_log_group" "test_push" {
  name              = "/aws/lambda/rin-${var.environment}-test-push"
  retention_in_days = 14
}
resource "aws_iam_role" "test_push" {
  name = "rin-${var.environment}-test-push"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }
  ] })
}
resource "aws_iam_role_policy" "test_push" {
  role = aws_iam_role.test_push.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.test_push.arn}:*" },
    { Effect    = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem"], Resource = aws_dynamodb_table.data.arn,
      Condition = { "ForAllValues:StringEquals" = { "dynamodb:LeadingKeys" = ["USER#${var.internal_user_id}"] } }
      }, {
      Effect    = "Allow", Action = ["dynamodb:GetItem"], Resource = aws_dynamodb_table.data.arn,
      Condition = { "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["ASSISTANT#*", "DEVICE#*"] } }
    }
    ], var.firebase_secret_arn == null ? [] : [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.firebase_secret_arn }
  ]) })
}
resource "aws_lambda_function" "test_push" {
  function_name    = "rin-${var.environment}-test-push"
  role             = aws_iam_role.test_push.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "test-push.handler"
  filename         = "${path.module}/../../../../dist/test-push.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/test-push.zip")
  timeout          = 20
  memory_size      = 256
  environment {
    variables = merge({
      APP_ENV             = var.environment
      TABLE_NAME          = aws_dynamodb_table.data.name
      DEV_USER_ID         = var.dev_user_id
      INTERNAL_USER_ID    = var.internal_user_id
      TEST_PUSH_DEVICE_ID = var.test_push_device_id
      TEST_PUSH_ENABLED   = tostring(var.enable_test_push_schedule)
    }, var.firebase_secret_arn == null ? {} : { FIREBASE_SECRET_ARN = var.firebase_secret_arn })
  }
  lifecycle {
    precondition {
      condition     = !var.enable_test_push_schedule || var.firebase_secret_arn != null
      error_message = "Firebase must be configured before enabling scheduled pushes."
    }
    precondition {
      condition     = !var.enable_test_push_schedule || can(regex("^[0-9a-f]{8}-[0-9a-f]{4}-[17][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", var.internal_user_id))
      error_message = "Scheduled test push needs INTERNAL_USER_ID as an internal UUID."
    }
  }
  depends_on = [aws_cloudwatch_log_group.test_push, aws_iam_role_policy.test_push]
}
resource "aws_lambda_function_event_invoke_config" "test_push" {
  function_name                = aws_lambda_function.test_push.function_name
  maximum_event_age_in_seconds = 60
  maximum_retry_attempts       = 0
}
resource "aws_scheduler_schedule_group" "test_push" {
  name = "rin-${var.environment}-test-push"
}
resource "aws_iam_role" "test_push_scheduler" {
  name = "rin-${var.environment}-test-push-scheduler"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole",
    Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.test_push.account_id }, ArnEquals = { "aws:SourceArn" = aws_scheduler_schedule_group.test_push.arn } } }
  ] })
}
resource "aws_iam_role_policy" "test_push_scheduler" {
  role = aws_iam_role.test_push_scheduler.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.test_push.arn }
  ] })
}
resource "aws_scheduler_schedule" "test_push" {
  name                         = "rin-${var.environment}-hourly-test-push"
  group_name                   = aws_scheduler_schedule_group.test_push.name
  description                  = "Rin test push hourly from 08:00 through 20:00 Sao Paulo, every day."
  schedule_expression          = "cron(0 8-20 * * ? *)"
  schedule_expression_timezone = "America/Sao_Paulo"
  state                        = var.enable_test_push_schedule ? "ENABLED" : "DISABLED"
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_lambda_function.test_push.arn
    role_arn = aws_iam_role.test_push_scheduler.arn
    # Terraform jsonencode escapes angle brackets; Scheduler needs the literal token.
    input = "{\"scheduledAt\":\"<aws.scheduler.scheduled-time>\"}"
    retry_policy {
      maximum_event_age_in_seconds = 60
      maximum_retry_attempts       = 0
    }
  }
  depends_on = [aws_iam_role_policy.test_push_scheduler, aws_lambda_function_event_invoke_config.test_push]
}
output "test_push_schedule" {
  value = {
    name     = aws_scheduler_schedule.test_push.name
    group    = aws_scheduler_schedule_group.test_push.name
    timezone = aws_scheduler_schedule.test_push.schedule_expression_timezone
    state    = aws_scheduler_schedule.test_push.state
    lambda   = aws_lambda_function.test_push.function_name
  }
}
