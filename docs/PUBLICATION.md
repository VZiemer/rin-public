# Política de publicação

## Conteúdo permitido

Código, contratos, schemas, testes sintéticos, documentação técnica e infraestrutura parametrizada. Os seeds desta edição foram escritos como exemplos fictícios. Os módulos de processamento de assets são código; as imagens e dados de catálogo reais permanecem privados.

## Conteúdo proibido

- Chaves, tokens, contas de serviço, arquivos `.env`, certificados e keystores.
- Dados pessoais, conversas, memórias, perfis, relações, localização ou extratos reais.
- Assets do front ou backend: imagens, áudio, vídeo, fontes, vetores, catálogos operacionais e mídia embutida em texto.
- Configurações Firebase reais, endpoints de implantação, IDs de contas cloud e URLs assinadas de produção.
- State/plan Terraform, logs, caches, capturas, builds, binários, arquivos compactados, LFS e submódulos.
- Histórico, patches não revisados, branches e tags dos repositórios privados.

## Antes do push

Instale Gitleaks 8.30.1 no PATH e ative os hooks locais após clonar:

```sh
git config core.hooksPath .githooks
```

Os hooks bloqueiam commit/push se o scanner faltar ou detectar violações. Hooks locais não são instalados automaticamente pelo Git em outros clones e podem ser desativados; a CI complementa essa proteção.

Alternativamente, configure o caminho local do executável com `git config rin.gitleaksPath CAMINHO_DO_EXECUTAVEL`. Esse valor fica apenas na configuração local do Git.

1. Trabalhe neste clone público, selecionando alterações técnicas individualmente.
2. Revise o diff completo, inclusive arquivos novos e fixtures; use dados fictícios.
3. Execute testes e `npm run test:publication`.
4. Adicione os arquivos ao index e execute `npm run check:publication` e Gitleaks com redação de resultados.
5. Revise também título, corpo e comentários de PR: o scanner de arquivos não verifica automaticamente esse texto.

O guard inspeciona o conteúdo do index e todas as versões alcançáveis no histórico local. Gitleaks complementa a verificação com regras de credenciais. Nenhum scanner prova ausência absoluta de dados pessoais; revisão humana continua necessária.

CI ocorre depois do push: rejeitar um PR não desfaz a exposição de conteúdo que já chegou a um branch público. Nunca use um PR público como área de triagem de material privado. Se houver vazamento, revogue credenciais, contenha o acesso e trate histórico, forks e caches separadamente.

## Proteções

Os workflows usam permissões de leitura, ações fixadas por commit e não recebem segredos de produção. Mudanças nas verificações de publicação, workflows ou configurações de segurança exigem revisão do mantenedor. Branch protection e push protection são configurações do GitHub e devem ser verificadas no servidor; arquivos YAML por si só não as ativam.
