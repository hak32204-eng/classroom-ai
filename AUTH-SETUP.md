# Этап привязки Google: внутренняя реализация

Это не готовый публичный коннектор. PR #3 остаётся черновиком; main не изменён.

`src/mcp-identity.ts` проверяет JWT через jose: подпись RS256/ES256, issuer,
audience ресурса MCP, срок действия, iat, sub и scope classroom:read.
Адрес JWKS задаётся оператором. Google access/id tokens для этого не подходят.
Идентификатор хранения — SHA-256 от пары issuer/sub. Не принимайте userId из запроса.

`src/google-link.ts` связывает проверенную личность с одноразовым state, PKCE
и отдельным случайным секретом браузера. Подмена identity объектом отклоняется.
Callback потребляет state до обмена кода: повтор после ошибки требует нового входа.
Refresh token шифруется существующим AES-GCM хранилищем.

Маршруты намеренно не подключены. Для завершения HTTP-интеграции нужны:

- OAuth 2.1 authorization server, выдающий токены для MCP, и resource metadata.
- Проверенная браузерная сессия той же личности на start и callback.
- POST start с проверкой Origin/CSRF; browserSecret только в Secure HttpOnly
  SameSite=Lax cookie с префиксом __Host-, TTL 600 секунд и Path=/.
- Ограничения частоты, очистка истёкших state, отзыв MCP-сессий и Google grants.
- Проверка согласия, refresh lifecycle и тесты реальных клиентов.

## D1: первый шаг владельца

В каталоге проекта после установки Node.js/npm выполните:

```powershell
npx wrangler login
npx wrangler d1 create classroom-ai-auth
```

Сохраните выданный Cloudflare блок `[[d1_databases]]` в wrangler.toml,
изменив binding на `DB`, и добавьте `migrations_dir = "migrations"`.
Используйте только выданный database_id. Затем:

```powershell
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

Удалённая D1 в этой сессии не проверена. Перед включением маршрутов проверьте
атомарный DELETE RETURNING на реальной базе, повтор callback и два параллельных
callback. Используйте primary session D1 для auth, без чтения устаревших реплик.

Через Worker Secrets задаются GOOGLE_CLIENT_SECRET и TOKEN_ENCRYPTION_KEY
(32 случайных байта в base64). Секреты в чат и GitHub не отправлять.
Настройка этих значений сама по себе не включает маршруты.

Основание: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
и https://developers.cloudflare.com/d1/sql-api/sql-statements/ .
