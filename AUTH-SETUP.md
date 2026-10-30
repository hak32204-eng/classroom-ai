# Настройка Classroom AI

Код ветки реализует OAuth и MCP. Реальный вход Google и совместимость ChatGPT/Claude ещё не подтверждены. Успешная сборка не означает работающего подключения.

## Cloudflare и схема

Worker `classroom-ai`, адрес `https://classroom-ai.hak32204.workers.dev`. D1 `classroom-ai-auth`, ID `5e43b117-460c-46b5-bce2-baf65a2b073d`, binding `DB` подтверждён в Dashboard. Конфигурация ветки содержит эти значения и `AUTH_ENABLED="false"`.

Владелец выполнил `0001_auth.sql` вручную. 30 октября 2026 года через Dashboard выполнена также `0002_mcp.sql`: проверены oauth_kv, oauth_replays, request_limits, web_sessions, индекс idx_oauth_kv_expiry и поле google_credentials.credential_version. Обе миграции применены вручную, без учёта в Wrangler. Приведённые ниже команды миграции предназначены для новых баз; на текущей базе сначала согласуйте учёт уже выполненных миграций.

```sh
npx wrangler login
npx wrangler d1 migrations apply DB --local
npx wrangler d1 migrations apply DB --remote
```

Если `0002` выполнена вручную через Console, повторно её не запускайте: `ALTER TABLE ADD COLUMN` не идемпотентен. Сначала проверьте `PRAGMA table_info(google_credentials)` и список таблиц. Выполняйте только отсутствующие изменения; не удаляйте данные. `0001` использует `IF NOT EXISTS`.

OAuth KV-адаптер использует primary session D1. Callback потребляет transaction атомарным DELETE RETURNING; token endpoint ставит replay fence. Перед включением проверить эти операции и параллельные запросы на удалённой D1.

## Google и секреты

В Google Cloud нужны включённый Classroom API, Web OAuth client и точный redirect URI:

```text
https://classroom-ai.hak32204.workers.dev/auth/google/callback
```

Для External/Testing добавьте аккаунт в test users. Проверяйте актуальные ограничения Google перед публичным выпуском. Разрешения: openid, classroom.courses.readonly, classroom.coursework.me.readonly.

В Worker → Settings → Runtime variables and secrets задайте:

- GOOGLE_CLIENT_ID — ID Web OAuth клиента.
- GOOGLE_CLIENT_SECRET — тип Secret, значение из Google Cloud.
- TOKEN_ENCRYPTION_KEY — тип Secret, 32 криптографически случайных байта в base64.

Вводите секреты напрямую в Cloudflare. Не отправляйте их в чат, GitHub или логи. При утечке client secret замените его в Google Cloud. Смена ключа шифрования без миграции credentials потребует повторного подключения пользователей.

CLI поддерживает интерактивные `npx wrangler secret put GOOGLE_CLIENT_SECRET`, `npx wrangler secret put TOKEN_ENCRYPTION_KEY`, `npx wrangler secret put GOOGLE_CLIENT_ID`.

Пока AUTH_ENABLED=false, защищённые маршруты возвращают 503. Health и информационные страницы доступны.

## Выпуск

1. Завершить TypeScript, тесты и Wrangler dry-run в PR. Проверить удалённую схему. Не сливать черновик ради запуска.
2. Развернуть проверенную ветку с выключенной авторизацией. Проверить /health, /privacy, /delete-data и ответ 503 от /mcp.
3. После задания секретов и готовности владельца к личному тесту изменить AUTH_ENABLED на true в конфигурации выпуска и развернуть.
4. Проверить discovery, DCR, PKCE, resource, отклонение неверных redirect URI/Origin/cookie и повторов code/state. Пройти Google consent тестового аккаунта. Google-токены нельзя использовать как MCP bearer tokens.
5. Добавить в MCP-клиент сервер с URL https://classroom-ai.hak32204.workers.dev/mcp и OAuth. Проверить реальные собственные курсы, задания, refresh и переподключение отдельно в ChatGPT и Claude.
6. Вторым тестовым аккаунтом проверить изоляцию. После disconnect_google с подтверждением старые токены не должны давать данные, refresh должен отклоняться, другой аккаунт должен продолжать работать.
7. Проверить /account, браузерное удаление и Google revoke. Запасной путь отзыва: https://myaccount.google.com/permissions . Повторное подключение должно инвалидировать предыдущие клиенты.
8. Проверить cron `17 3 * * *` и удаление истёкших записей. Затем решать вопрос публичного выпуска и Google verification. Не включать логи с code/state/cookies/tokens.

Откат: выключить AUTH_ENABLED и развернуть проверенную версию. Это блокирует доступ, но не отзывает Google grants. Не удалять D1.

Основание: [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [ChatGPT OAuth](https://developers.openai.com/plugins/build/auth).
