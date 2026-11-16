variable "enable_world_schedule" {
  type    = bool
  default = true
}
variable "enable_morning_briefing_schedule" {
  type    = bool
  default = true
}
resource "aws_cloudwatch_log_group" "world_refresh" {
  name              = "/aws/lambda/rin-${var.environment}-world-refresh"
  retention_in_days = 14
}
resource "aws_iam_role" "world_refresh" {
  name = "rin-${var.environment}-world-refresh"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }
  ] })
}
resource "aws_iam_role_policy" "world_refresh" {
  role = aws_iam_role.world_refresh.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.world_refresh.arn}:*" },
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Scan"], Resource = aws_dynamodb_table.data.arn }
  ] })
}
resource "aws_lambda_function" "world_refresh" {
  function_name    = "rin-${var.environment}-world-refresh"
  role             = aws_iam_role.world_refresh.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "world-refresh.handler"
  filename         = "${path.module}/../../../../dist/world-refresh.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/world-refresh.zip")
  timeout          = 120
  memory_size      = 256
  environment {
    variables = {
      APP_ENV               = var.environment
      TABLE_NAME            = aws_dynamodb_table.data.name
      TIMEZONE              = var.timezone
      WORLD_REFRESH_ENABLED = tostring(var.enable_world_schedule)
    }
  }
  depends_on = [aws_cloudwatch_log_group.world_refresh, aws_iam_role_policy.world_refresh]
}
resource "aws_lambda_function_event_invoke_config" "world_refresh" {
  function_name                = aws_lambda_function.world_refresh.function_name
  maximum_event_age_in_seconds = 300
  maximum_retry_attempts       = 1
}
resource "aws_scheduler_schedule_group" "world" {
  name = "rin-${var.environment}-world"
}
resource "aws_iam_role" "world_scheduler" {
  name = "rin-${var.environment}-world-scheduler"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "scheduler.amazonaws.com" }, Action = "sts:AssumeRole",
      Condition = {
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.proactive_tick.account_id },
        ArnEquals    = { "aws:SourceArn" = aws_scheduler_schedule_group.world.arn }
      }
    }
  ] })
}
resource "aws_iam_role_policy" "world_scheduler" {
  role = aws_iam_role.world_scheduler.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = [aws_lambda_function.world_refresh.arn, aws_lambda_function.proactive_tick.arn] }
  ] })
}
resource "aws_scheduler_schedule" "world_refresh" {
  name                         = "rin-${var.environment}-world-refresh"
  group_name                   = aws_scheduler_schedule_group.world.name
  description                  = "Refresh personal weather, interest headlines and exchange quotes at 07:00 and noon."
  schedule_expression          = "cron(0 7,12 * * ? *)"
  schedule_expression_timezone = var.timezone
  state                        = var.enable_world_schedule ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.world_refresh.arn
    role_arn = aws_iam_role.world_scheduler.arn
    retry_policy {
      maximum_event_age_in_seconds = 300
      maximum_retry_attempts       = 1
    }
  }
  depends_on = [aws_iam_role_policy.world_scheduler, aws_lambda_function_event_invoke_config.world_refresh]
}
resource "aws_scheduler_schedule" "morning_briefing" {
  name                         = "rin-${var.environment}-morning-briefing"
  group_name                   = aws_scheduler_schedule_group.world.name
  description                  = "Rin good morning grounded in the latest personal world context."
  schedule_expression          = "cron(0 8 * * ? *)"
  schedule_expression_timezone = var.timezone
  state                        = var.enable_world_schedule && var.enable_morning_briefing_schedule && var.enable_proactive_tick_schedule ? "ENABLED" : "DISABLED"
  flexible_time_window { mode = "OFF" }
  target {
    arn      = aws_lambda_function.proactive_tick.arn
    role_arn = aws_iam_role.world_scheduler.arn
    input    = jsonencode({ kind = "morning_briefing" })
    retry_policy {
      maximum_event_age_in_seconds = 60
      maximum_retry_attempts       = 0
    }
  }
  depends_on = [aws_iam_role_policy.world_scheduler, aws_lambda_function_event_invoke_config.proactive_tick]
}
output "world_schedules" {
  value = {
    timezone = var.timezone
    refresh  = { name = aws_scheduler_schedule.world_refresh.name, state = aws_scheduler_schedule.world_refresh.state, expression = aws_scheduler_schedule.world_refresh.schedule_expression }
    morning  = { name = aws_scheduler_schedule.morning_briefing.name, state = aws_scheduler_schedule.morning_briefing.state, expression = aws_scheduler_schedule.morning_briefing.schedule_expression }
  }
}
