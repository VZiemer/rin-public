# Arquitetura

## Backend

A regra de dependência é `entrypoints/adapters → application → domain`. O domínio define identidades, contratos, finanças, contexto e estado. A aplicação contém casos de uso e portas; adapters implementam DynamoDB, S3, autenticação, notificações e providers de modelo. O bootstrap compõe essas dependências manualmente.

`AgentContextBuilder` monta o contexto com repositories. `SystemPromptRenderer` prepara instruções e dados; `AgentLoop` coordena o modelo e a execução das tools. As tools têm schemas, nomes estáveis e políticas de execução. Dados de memória, uploads e fontes externas não devem ser tratados como instruções privilegiadas.

O runtime usa DynamoDB como fonte persistente. Seeds existem para bootstrap e testes; não representam dados do proprietário. A inicialização usa `insert-missing` por padrão. O código de armazenamento e seleção de assets é público; os objetos S3, catálogos operacionais e as imagens não são distribuídos.

Lambda chama Bedrock diretamente usando permissões IAM. Não existe um servidor MCP intermediário. EventBridge dispara processamento de lembretes, iniciativa e atualização de contexto. Firebase entrega notificações ao Android. Terraform descreve recursos, permissões e configurações parametrizadas.

## Android

Kotlin e Compose implementam telas; serviços Android mantêm overlay e sessões de foco. Repositórios e controllers separam estado, ações locais, autenticação e chamadas HTTP. O renderer resolve estados visuais sem decidir regras de negócio do backend.

Os nomes dos recursos permanecem no código para preservar contratos e testes. Um task Gradle gera placeholders geométricos exclusivos para esta edição. Nenhuma imagem da versão privada é necessária para compilar. Os arquivos gerados ficam sob `build/` e são rejeitados pela política de publicação.

## Fronteira pública/privada

O projeto público possui histórico independente. Não deve receber merges, pushes `--mirror`, tags ou bundles do repositório privado. As atualizações entram como alterações de código selecionadas e revisadas. Não usar dados de produção em fixtures, screenshots, exemplos de terminal ou descrições de PR.
