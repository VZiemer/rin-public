# Architecture

## Backend

The dependency rule is `entrypoints/adapters → application → domain`. The domain defines identities, contracts, finances, context and state. The application contains use cases and ports; adapters implement DynamoDB, S3, authentication, notifications and model providers. Bootstrap composes these dependencies manually.

`AgentContextBuilder` assembles context using repositories. `SystemPromptRenderer` prepares instructions and data; `AgentLoop` coordinates the model and tool execution. Tools have schemas, stable names and execution policies. Memory, uploads and external sources must not be treated as privileged instructions.

The runtime uses DynamoDB for persistence. Seeds support bootstrap and tests; they do not represent the owner's data. Initialization uses `insert-missing` by default. Asset storage and selection code is public; S3 objects, operational catalogs and images are not distributed.

Lambda calls Bedrock directly using IAM permissions. There is no intermediate MCP server. EventBridge triggers reminders, proactive messages and context updates. Firebase delivers notifications to Android. Terraform describes parameterized resources, permissions and settings.

## Android

Kotlin and Compose implement screens; Android services maintain the overlay and focus sessions. Repositories and controllers separate state, local actions, authentication and HTTP calls. The renderer resolves visual states without deciding backend business rules.

Resource names remain in the code to preserve contracts and tests. A Gradle task generates geometric placeholders specifically for this edition. No private images are required to compile it. Generated files stay under `build/` and are rejected by the publication policy.

## Public/private boundary

The public project has an independent history. It must not receive merges, `--mirror` pushes, tags or bundles from the private repository. Updates consist of individually selected and reviewed code changes. Do not use production data in fixtures, screenshots, terminal examples or PR descriptions.
