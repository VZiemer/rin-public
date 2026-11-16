variable "enable_proactive_tick_schedule" {
  type    = bool
  default = true
}
variable "proactive_tick_schedule_expression" {
  type    = string
  default = "rate(30 minutes)"
}
data "aws_caller_identity" "proactive_tick" {}
resource "aws_cloudwatch_log_group" "proactive_tick" {
  name              = "/aws/lambda/rin-${var.environment}-proactive-tick"
  retention_in_days = 14
}
resource "aws_iam_role" "proactive_tick" {
  name = "rin-${var.environment}-proactive-tick"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }
  ] })
}
resource "aws_iam_role_policy" "proactive_tick" {
  role = aws_iam_role.proactive_tick.id
  policy = jsonencode({ Version = "2012-10-17", Statement = concat([
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.proactive_tick.arn}:*" },
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:ConditionCheckItem"], Resource = aws_dynamodb_table.data.arn }
    ],
    length(var.bedrock_model_arns) > 0 ? [
      { Effect = "Allow", Action = ["bedrock:InvokeModel"], Resource = var.bedrock_model_arns }
    ] : [],
    var.firebase_secret_arn == null ? [] : [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.firebase_secret_arn }
  ]) })
}
resource "aws_lambda_function" "proactive_tick" {
  function_name    = "rin-${var.environment}-proactive-tick"
  role             = aws_iam_role.proactive_tick.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "proactive-tick.handler"
  filename         = "${path.module}/../../../../dist/proactive-tick.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/proactive-tick.zip")
  timeout          = 120
  memory_size      = 256
  environment {
    variables = merge({
      APP_ENV                = var.environment
      TABLE_NAME             = aws_dynamodb_table.data.name
      DEV_USER_ID            = var.dev_user_id
      TIMEZONE               = var.timezone
      BEDROCK_MODEL_ID       = var.bedrock_model_id
      PROACTIVE_TICK_ENABLED = tostring(var.enable_proactive_tick_schedule)
    }, var.firebase_secret_arn == null ? {} : { FIREBASE_SECRET_ARN = var.firebase_secret_arn })
  }
  lifecycle {
    precondition {
      condition     = length(var.bedrock_model_arns) > 0
      error_message = "Proactive tick needs Bedrock model ARNs to generate messages."
    }
  }
  depends_on = [aws_cloudwatch_log_group.proactive_tick, aws_iam_role_policy.proactive_tick]
}
resource "aws_lambda_function_event_invoke_config" "proactive_tick" {
  function_name                = aws_lambda_function.proactive_tick.function_name
  maximum_event_age_in_seconds = 60
  maximum_retry_attempts       = 0
}
resource "aws_scheduler_schedule_group" "proactive_tick" {
  name = "rin-${var.environment}-proactive-tick"
}
resource "aws_iam_role" "proactive_tick_scheduler" {
  name = "rin-${var.environment}-proactive-tick-scheduler"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole",
    Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.proactive_tick.account_id }, ArnEquals = { "aws:SourceArn" = aws_scheduler_schedule_group.proactive_tick.arn } } }
  ] })
}
resource "aws_iam_role_policy" "proactive_tick_scheduler" {
  role = aws_iam_role.proactive_tick_scheduler.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.proactive_tick.arn }
  ] })
}
resource "aws_scheduler_schedule" "proactive_tick" {
  name                = "rin-${var.environment}-proactive-tick"
  group_name          = aws_scheduler_schedule_group.proactive_tick.name
  description         = "Rin proactive tick: may start a spontaneous message when it feels natural."
  schedule_expression = var.proactive_tick_schedule_expression
  state               = var.enable_proactive_tick_schedule ? "ENABLED" : "DISABLED"
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_lambda_function.proactive_tick.arn
    role_arn = aws_iam_role.proactive_tick_scheduler.arn
    retry_policy {
      maximum_event_age_in_seconds = 60
      maximum_retry_attempts       = 0
    }
  }
  depends_on = [aws_iam_role_policy.proactive_tick_scheduler, aws_lambda_function_event_invoke_config.proactive_tick]
}
output "proactive_tick_schedule" {
  value = {
    name       = aws_scheduler_schedule.proactive_tick.name
    group      = aws_scheduler_schedule_group.proactive_tick.name
    expression = aws_scheduler_schedule.proactive_tick.schedule_expression
    state      = aws_scheduler_schedule.proactive_tick.state
    lambda     = aws_lambda_function.proactive_tick.function_name
  }
}
