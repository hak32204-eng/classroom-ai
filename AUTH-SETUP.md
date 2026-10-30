# Настройка Classroom AI

Реальный вход Google, чтение курсов, списка и описания заданий, а также обновление MCP-токена проверены 30 октября 2026 года. В ChatGPT также проверены установка, курсы, новый поиск и мастер подготовки работы. Проверка Claude ещё не завершена. Инструкции LM Studio и Open WebUI подготовлены по документации; реальные вызовы из них пока не проверены. Успешная сборка сама по себе не подтверждает совместимость клиентов.

## Для обычного пользователя

Откройте [мастер подключения](https://classroom-ai.hak32204.workers.dev/connect), выберите свой AI-клиент, вставьте единственный MCP URL и войдите через Google. API-ключи, терминал и собственный Worker пользователю не нужны. Следующие разделы предназначены для оператора сервиса.

OAuth обновляет доступ автоматически, пока действуют разрешения и refresh-токены. В режиме Google Testing эти разрешения не означают бессрочное подключение: для используемых scopes Google refresh-токены истекают через 7 дней. Production verification, отзыв доступа и политика организации — отдельные условия. MCP refresh-grants сейчас также ограничены семью днями; срок нужно пересмотреть и проверить перед публичным обещанием длительной автономной работы.

Тестовый Worker развернут из `deploy/google-oauth-test`, где `AUTH_ENABLED=true`. Ветка разработки сохраняет значение по умолчанию `false`. Google остаётся External/Testing с двумя тестовыми пользователями, добавленными с разрешения владельца. Публичный выпуск приложения Google не выполнялся.

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

30 октября 2026 года проверены проект `classroom-ai-513208`, Web OAuth client `Classroom AI Connector` и точный callback. Дополнительный Client Secret создан с подтверждением владельца и сохранён в Production Worker как Secret `GOOGLE_CLIENT_SECRET`; Dashboard подтвердил `Value encrypted`. `TOKEN_ENCRYPTION_KEY` создан из 32 случайных байтов и также сохранён как Secret. Публичный `GOOGLE_CLIENT_ID` сохранён в Worker и синхронизирован с wrangler.toml. Секреты не хранятся в репозитории.

В Google Cloud нужны включённый Classroom API, Web OAuth client и точный redirect URI:

```text
https://classroom-ai.hak32204.workers.dev/auth/google/callback
```

Для External/Testing добавьте аккаунт в test users. Проверяйте актуальные ограничения Google перед публичным выпуском. Разрешения по умолчанию: openid, classroom.courses.readonly, classroom.coursework.me.readonly. Необязательное classroom.rosters.readonly запрашивается только по отдельной отмеченной опции для имён преподавателей. По умолчанию она выключена. Код не читает состав учащихся. Пользователь должен отдельно подтвердить расширение доступа.

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
7. Проверить /account, браузерное удаление и Google revoke. Запасной путь отзыва: https://myaccount.google.com/permissions . Два клиента с одним Google-аккаунтом должны работать одновременно. После отзыва повторное подключение не должно восстанавливать доступ старых MCP grants.
8. Проверить cron `17 3 * * *` и удаление истёкших записей. Затем решать вопрос публичного выпуска и Google verification. Не включать логи с code/state/cookies/tokens.

Откат: выключить AUTH_ENABLED и развернуть проверенную версию. Это блокирует доступ, но не отзывает Google grants. Не удалять D1.

Основание: [Cloudflare OAuth provider](https://github.com/cloudflare/workers-oauth-provider), [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization), [ChatGPT OAuth](https://developers.openai.com/plugins/build/auth).
