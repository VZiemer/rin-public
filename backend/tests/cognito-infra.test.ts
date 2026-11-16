import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('provisions an environment-aware Cognito pool and public Android client', () => {
  const tf = readFileSync('infra/terraform/environments/dev/cognito.tf', 'utf8');
  expect(tf).toContain('aws_cognito_user_pool');
  expect(tf).toContain('rin-${var.environment}-users');
  expect(tf).toContain('username_attributes      = ["email"]');
  expect(tf).toContain('generate_secret                      = false');
  expect(tf).toContain('ALLOW_REFRESH_TOKEN_AUTH');
  expect(tf).toContain('ALLOW_USER_PASSWORD_AUTH');
  expect(tf).not.toContain('userId');
});
