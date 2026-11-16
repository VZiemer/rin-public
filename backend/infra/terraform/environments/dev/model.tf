variable "model_provider" {
  type    = string
  default = "static"
  validation {
    condition     = contains(["static", "bedrock"], var.model_provider)
    error_message = "Supported providers: static, bedrock."
  }
}
variable "bedrock_model_id" {
  type    = string
  default = "amazon.nova-lite-v1:0"
}
variable "agent_bedrock_model_id" {
  type        = string
  default     = null
  description = "Optional chat-only Converse model override, independent from background services."
}
variable "agent_bedrock_model_arns" {
  type    = list(string)
  default = []
}
resource "aws_iam_role_policy" "agent_bedrock_model" {
  count = var.agent_model_provider == "bedrock" && var.agent_bedrock_model_id != null ? 1 : 0
  role  = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["bedrock:InvokeModel"], Resource = var.agent_bedrock_model_arns }
  ] })
  lifecycle {
    precondition {
      condition     = length(var.agent_bedrock_model_arns) > 0 && alltrue([for arn in var.agent_bedrock_model_arns : !strcontains(arn, "*")])
      error_message = "Specify explicit model/profile ARNs for the interactive Bedrock override."
    }
  }
}
variable "agent_model_provider" {
  type        = string
  default     = null
  description = "Optional interactive chat override. Background services retain model_provider."
  validation {
    condition     = var.agent_model_provider == null ? true : contains(["static", "bedrock", "bedrock-openai", "openai"], var.agent_model_provider)
    error_message = "Supported chat providers: static, bedrock, bedrock-openai, openai."
  }
}
variable "bedrock_openai_model_id" {
  type    = string
  default = "us.openai.gpt-6.1-sol"
}
variable "bedrock_openai_model_arns" {
  type    = list(string)
  default = []
}
locals {
  bedrock_openai_profile_arn  = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.proactive_tick.account_id}:inference-profile/${var.bedrock_openai_model_id}"
  bedrock_openai_project_arn  = "arn:aws:bedrock:${var.aws_region}:${data.aws_caller_identity.proactive_tick.account_id}:project/default"
  bedrock_openai_destinations = [for arn in var.bedrock_openai_model_arns : arn if strcontains(arn, ":foundation-model/")]
}
resource "aws_iam_role_policy" "bedrock_openai" {
  count = var.agent_model_provider == "bedrock-openai" ? 1 : 0
  role  = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    {
      Effect    = "Allow", Action = ["bedrock:InvokeModel"], Resource = local.bedrock_openai_profile_arn,
      Condition = { ArnEquals = { "bedrock:ProjectArn" = local.bedrock_openai_project_arn } }
    },
    {
      Effect    = "Allow", Action = ["bedrock:InvokeModel"], Resource = local.bedrock_openai_destinations,
      Condition = { ArnEquals = { "bedrock:InferenceProfileArn" = local.bedrock_openai_profile_arn } }
    },
    {
      Effect    = "Allow", Action = ["bedrock:InvokeModel"], Resource = local.bedrock_openai_project_arn,
      Condition = { ArnEquals = { "bedrock:ModelArn" = local.bedrock_openai_profile_arn } }
    },
    { Effect = "Allow", Action = ["bedrock:GetInferenceProfile"], Resource = local.bedrock_openai_profile_arn }
  ] })
  lifecycle {
    precondition {
      condition     = length(local.bedrock_openai_destinations) > 0 && contains(var.bedrock_openai_model_arns, local.bedrock_openai_profile_arn) && alltrue([for arn in var.bedrock_openai_model_arns : !strcontains(arn, "*")])
      error_message = "Specify the exact OpenAI system profile ARN and all destination foundation-model ARNs."
    }
  }
}
variable "openai_model_id" {
  type    = string
  default = "gpt-6.1-sol"
}
variable "openai_secret_arn" {
  type        = string
  default     = null
  description = "Existing Secrets Manager secret containing an OpenAI API key (raw or JSON apiKey)."
  validation {
    condition     = var.openai_secret_arn == null ? true : startswith(var.openai_secret_arn, "arn:aws:secretsmanager:") && !strcontains(var.openai_secret_arn, "*")
    error_message = "Specify a Secrets Manager ARN."
  }
}
resource "aws_iam_role_policy" "openai_secret" {
  count = var.agent_model_provider == "openai" && var.openai_secret_arn != null ? 1 : 0
  role  = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = var.openai_secret_arn }
  ] })
}
variable "bedrock_model_arns" {
  type    = list(string)
  default = []
}
resource "aws_iam_role_policy" "model" {
  count = var.model_provider == "bedrock" || var.agent_model_provider == "bedrock" ? 1 : 0
  role  = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["bedrock:InvokeModel"], Resource = var.bedrock_model_arns }
  ] })
  lifecycle {
    precondition {
      condition     = length(var.bedrock_model_arns) > 0 && alltrue([for arn in var.bedrock_model_arns : !strcontains(arn, "*")])
      error_message = "Specify explicit model/profile ARNs for Bedrock."
    }
  }
}
