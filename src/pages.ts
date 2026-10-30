export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
export function page(title:string,body:string,headers:Headers = new Headers(),status=200) {
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  headers.set('x-frame-options','DENY');
  // Preserve Origin on same-origin HTML form POSTs; send no Referer cross-origin.
  headers.set('referrer-policy','same-origin');
  headers.set('x-content-type-options','nosniff');
  return new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+escapeHtml(title)+'</title><style>body{font:18px/1.6 system-ui;margin:48px auto;padding:0 24px;max-width:720px;color:#17202a}button{font:inherit;margin:8px;padding:10px 20px}a{color:#1646a0}code{overflow-wrap:anywhere}</style><main><h1>'+escapeHtml(title)+'</h1>'+body+'</main></html>',{status,headers});
}
export function infoPage(path:string) {
  if(path==='/privacy') return page('Конфиденциальность Classroom AI',`
    <p>Classroom AI передаёт доступные вам курсы и задания Google Classroom в подключённый вами AI-клиент по вашему запросу. Отдельный AI API не используется.</p>
    <p>На Cloudflare хранятся зашифрованные Google refresh-токены, непрозрачный идентификатор аккаунта и технические OAuth-сессии. Курсы, задания, оценки, вложения и AI-ответы постоянно не сохраняются. Для защиты от злоупотреблений сохраняется хеш IP-адреса с маршрутом и коротким временным окном; истёкшие записи удаляются ежедневным обслуживанием.</p>
    <p>Google-разрешения: openid для проверки личности, classroom.courses.readonly и classroom.coursework.me.readonly для чтения. Передаваемые данные обрабатываются также по правилам выбранного вами ChatGPT или Claude. Публичная совместимость ещё не подтверждена.</p>
    <p>Использование информации Google API соответствует Google API Services User Data Policy, включая Limited Use. Данные не продаются, не используются для рекламы или обучения собственных моделей.</p>
    <p>Отключение и удаление доступны через инструмент disconnect_google или <a href="/account">управление подключением</a>. При недоступности Google удалите разрешение Classroom AI также в <a href="https://myaccount.google.com/permissions">настройках Google</a>.</p>
    <p>Оператор проекта: hak32204-eng. Вопросы: <a href="https://github.com/hak32204-eng/classroom-ai/issues">GitHub Issues</a>; не публикуйте там персональные данные и секреты. Сервис находится на стадии тестирования.</p>`);
  if(path==='/delete-data') return page('Удаление данных',`<p>Откройте <a href="/account">управление подключением</a> в браузере, где вы вошли, либо вызовите инструмент <code>disconnect_google</code> из подключённого клиента.</p><p>Будут удалены локальные Google-токены и браузерные сессии, а доступ клиентов к учебным данным перестанет работать. Сервер также попробует отозвать разрешение в Google. Если Google недоступен, удалите его вручную в <a href="https://myaccount.google.com/permissions">аккаунте Google</a>.</p><p>Истёкшие технические записи удаляются плановым обслуживанием. Cloudflare может сохранять резервные копии в соответствии со своими сроками хранения.</p>`);
  if(path==='/') return page('Classroom AI',`<p>Google Classroom MCP-коннектор в разработке. Адрес подключения: <code>https://classroom-ai.hak32204.workers.dev/mcp</code>.</p><p>Доступ только для чтения. Публичная совместимость ChatGPT и Claude пока не подтверждена.</p><p><a href="/privacy">Конфиденциальность</a> · <a href="/account">Подключение</a> · <a href="/delete-data">Удаление данных</a></p>`);
  return null;
}
