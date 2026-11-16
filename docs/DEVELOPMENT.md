# Development setup

## Backend

Use `backend/.env.example` as a reference and supply environment variables to the process. The file is not loaded automatically. Tests use mocks and synthetic data without depending on AWS or Firebase. `MODEL_PROVIDER=static` allows testing the agent flow without model calls, but handlers using DynamoDB repositories still need configuration or mocks.

The build produces Lambda bundles and ZIPs in `backend/dist/`, which is always ignored. Do not publish build artifacts as releases without a separate review.

For your own deployment, configure AWS credentials outside Git, review `infra/terraform/environments/dev/terraform.tfvars.example` and run these commands from `backend/`:

```sh
terraform -chdir=infra/terraform/environments/dev init -backend=false
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/environments/dev validate
```

`terraform apply` creates billable resources and must be run manually in your own environment. State, plans and local values do not belong in the repository. Configure Firebase and provider keys in Secrets Manager, supplying their ARNs to the environment. Do not reuse identifiers or credentials from the private environment.

## Android

Install JDK 17, Gradle 9.7.1 and Android SDK 37. Set `ANDROID_HOME`. Optionally create your own `android/app/google-services.json`; this file is ignored and blocked by the publication check. Without it, the build produces a technical app for inspection and testing without functional Firebase push notifications.

Gradle reads `RIN_AGENT_BASE_URL`, `RIN_DEVICE_ID`, `RIN_COGNITO_CLIENT_ID`, `RIN_COGNITO_USER_POOL_ID` and `RIN_COGNITO_REGION`. Use values from your own environment. Never put access tokens in these variables or commit APKs.

The public edition disables Android backup and removes logs containing FCM tokens and notification payloads. This does not replace a product security audit before production use.
