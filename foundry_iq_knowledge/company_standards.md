# CloudSchema Company Infrastructure Standards

1. Every Azure resource must include an `owner` tag.
2. Every Azure resource must include an `environment` tag.
3. For beginner demos, use the Azure region from the deployment parameter `location`.
4. For App Service workloads, use a Basic B1 App Service Plan unless the user explicitly asks for a different tier.
5. Storage accounts must use HTTPS-only traffic and TLS 1.2 or newer.
6. Generated templates must avoid real secrets, real employee data, real customer data, and hard-coded credentials.
7. Prefer small, understandable infrastructure over production-heavy patterns unless the user asks for production scale.
