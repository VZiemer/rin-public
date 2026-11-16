import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('protects user routes with Cognito JWT and keeps health public', () => {
  const jwt = readFileSync('infra/terraform/environments/dev/jwt.tf', 'utf8');
  const routes = readFileSync('infra/terraform/environments/dev/routes.tf', 'utf8');
  const api = readFileSync('infra/terraform/environments/dev/api.tf', 'utf8');
  expect(jwt).toContain('authorizer_type  = "JWT"');
  expect(jwt).toContain('audience = [aws_cognito_user_pool_client.android.id]');
  expect(jwt).toContain('POST /session/bootstrap');
  expect(jwt).toContain('GET /me');
  expect(routes).toContain('authorization_type = "JWT"');
  expect(routes).toContain('authorizer_id      = aws_apigatewayv2_authorizer.cognito.id');
  expect(routes).not.toContain('authorization_type = "NONE"');
  expect(api).toContain('route_key = "GET /health"');
  expect(api).not.toMatch(/health[\s\S]{0,200}authorization_type/);
});
