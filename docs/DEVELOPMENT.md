# Ambiente de desenvolvimento

## Backend

Use `backend/.env.example` como referência e forneça variáveis ao processo. O arquivo não é carregado automaticamente. Testes usam mocks e dados sintéticos, sem depender de AWS ou Firebase. `MODEL_PROVIDER=static` permite validar o fluxo do agente sem chamadas a modelos, mas handlers que usam repositories DynamoDB ainda precisam de configuração ou mocks.

O build gera bundles Lambda e ZIPs em `backend/dist/`, sempre ignorados. Não publique os artefatos de build como releases sem uma revisão específica.

Para um deploy próprio, configure credenciais AWS fora do Git, revise `infra/terraform/environments/dev/terraform.tfvars.example` e rode:

```sh
terraform -chdir=infra/terraform/environments/dev init -backend=false
terraform fmt -check -recursive infra/terraform
terraform -chdir=infra/terraform/environments/dev validate
```

`terraform apply` cria recursos cobrados e deve ser executado manualmente no seu próprio ambiente. State, plans e valores locais não entram no repositório. Configure Firebase e chaves de providers em Secrets Manager, com ARNs fornecidos ao ambiente. Não reutilize identificadores ou credenciais do ambiente privado.

## Android

Instale JDK 17, Gradle 9.7.1 e Android SDK 37. Defina `ANDROID_HOME`. Opcionalmente, crie seu próprio `android/app/google-services.json`; o arquivo é ignorado e também bloqueado pela verificação de publicação. O build sem esse arquivo gera um app técnico para inspeção e testes, sem push Firebase funcional.

As variáveis `RIN_AGENT_BASE_URL`, `RIN_DEVICE_ID`, `RIN_COGNITO_CLIENT_ID`, `RIN_COGNITO_USER_POOL_ID` e `RIN_COGNITO_REGION` são lidas pelo Gradle. Use valores do seu próprio ambiente. Nunca inclua tokens de acesso nessas variáveis nem comite APKs.

A edição pública desativa backup Android e remove logs com tokens FCM e payloads de notificações. Isso não substitui uma auditoria de segurança do produto antes de uso em produção.
