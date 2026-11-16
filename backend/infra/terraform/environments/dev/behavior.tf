variable "enable_behavior_evolution" {
  type        = bool
  default     = true
  description = "Evaluate eligible completed conversations asynchronously when Bedrock is configured."
}

locals {
  behavior_evolution_enabled = var.enable_behavior_evolution && var.model_provider == "bedrock"
}

resource "aws_cloudwatch_log_group" "behavior_feedback" {
  name              = "/aws/lambda/rin-${var.environment}-behavior-feedback"
  retention_in_days = 14
}

resource "aws_iam_role" "behavior_feedback" {
  name = "rin-${var.environment}-behavior-feedback"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "behavior_feedback" {
  role = aws_iam_role.behavior_feedback.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.behavior_feedback.arn}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem"]
        Resource = aws_dynamodb_table.data.arn
        Condition = {
          "ForAllValues:StringLike" = {
            "dynamodb:LeadingKeys" = ["USER#*", "PERSONALITY#*", "ASSISTANT#*"]
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = aws_dynamodb_table.data.arn
        Condition = {
          "ForAllValues:StringLike" = { "dynamodb:LeadingKeys" = ["USER#*"] }
        }
      }
      ], var.model_provider == "bedrock" ? [{
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = var.bedrock_model_arns
    }] : [])
  })
}

resource "aws_lambda_function" "behavior_feedback" {
  function_name    = "rin-${var.environment}-behavior-feedback"
  role             = aws_iam_role.behavior_feedback.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "behavior-feedback.handler"
  filename         = "${path.module}/../../../../dist/behavior-feedback.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../../dist/behavior-feedback.zip")
  timeout          = 25
  memory_size      = 256
  environment {
    variables = {
      APP_ENV                   = var.environment
      TABLE_NAME                = aws_dynamodb_table.data.name
      TIMEZONE                  = var.timezone
      BEDROCK_MODEL_ID          = var.bedrock_model_id
      BEHAVIOR_FEEDBACK_ENABLED = tostring(local.behavior_evolution_enabled)
    }
  }
  depends_on = [aws_cloudwatch_log_group.behavior_feedback, aws_iam_role_policy.behavior_feedback]
}

resource "aws_lambda_function_event_invoke_config" "behavior_feedback" {
  function_name                = aws_lambda_function.behavior_feedback.function_name
  maximum_event_age_in_seconds = 3600
  maximum_retry_attempts       = 2
}

resource "aws_iam_role_policy" "api_behavior_feedback" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Action = ["lambda:InvokeFunction"], Resource = aws_lambda_function.behavior_feedback.arn
    }]
  })
}

output "behavior_feedback_function_name" {
  value = aws_lambda_function.behavior_feedback.function_name
}

output "behavior_evolution_enabled" {
  value = local.behavior_evolution_enabled
}
