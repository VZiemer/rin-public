resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.api.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "rin-${var.environment}-cognito"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.android.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.app.id}"
  }
}

resource "aws_apigatewayv2_route" "session_bootstrap" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "POST /session/bootstrap"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "me" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "GET /me"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "default_assistant" {
  for_each           = toset(["GET /profile/default-assistant", "PUT /profile/default-assistant"])
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_iam_role_policy" "auth_data" {
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:TransactWriteItems"]
      Resource = aws_dynamodb_table.data.arn
    }]
  })
}
