resource "aws_apigatewayv2_route" "message" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "POST /agent/message"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
resource "aws_iam_role_policy" "data" {
  role = aws_iam_role.api.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem"], Resource = aws_dynamodb_table.data.arn }
  ] })
}
resource "aws_apigatewayv2_route" "confirmation" {
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = "POST /agent/confirmations/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
resource "aws_apigatewayv2_route" "tasks" {
  for_each           = toset(["POST /tasks", "GET /tasks", "GET /tasks/{id}", "PATCH /tasks/{id}", "DELETE /tasks/{id}"])
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
resource "aws_apigatewayv2_route" "reminders" {
  for_each           = toset(["POST /reminders", "GET /reminders", "GET /reminders/{id}", "PATCH /reminders/{id}", "DELETE /reminders/{id}"])
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
resource "aws_apigatewayv2_route" "devices" {
  for_each           = toset(["PUT /devices/{deviceId}", "GET /devices/{deviceId}", "DELETE /devices/{deviceId}"])
  api_id             = aws_apigatewayv2_api.api.id
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}
