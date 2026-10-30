export const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
export function page(title:string,body:string,headers:Headers = new Headers(),status=200,validatedClientRedirect?:string) {
  let formAction="'self'";
  if(validatedClientRedirect) {
    // Chromium checks the redirect chain of a form POST. This URI has already
    // been matched against the registered OAuth client by parseAuthRequest().
    const redirect=new URL(validatedClientRedirect);
    formAction+=' https://accounts.google.com '+(redirect.origin==='null'?redirect.protocol:redirect.origin);
  }
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store');
  headers.set('content-security-policy',"default-src 'none'; style-src 'unsafe-inline'; form-action "+formAction+"; frame-ancestors 'none'; base-uri 'none'");
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
    <p>Google-разрешения: openid для проверки личности, classroom.courses.readonly и classroom.coursework.me.readonly для чтения. Передаваемые данные обрабатываются также по правилам выбранного вами ChatGPT или Claude. Подключение и чтение курсов проверены в ChatGPT; проверка Claude ещё не завершена. Сервис работает в закрытом тестовом режиме.</p>
    <p>Для необязательного автозаполнения преподавателя при подключении можно отдельно разрешить classroom.rosters.readonly. Google предоставляет этим разрешением чтение состава курсов, но коннектор запрашивает только имена преподавателей выбранного курса; списки учащихся, фотографии и email не запрашиваются. ФИО используются ровно в доступном виде, без выдуманного отчества. Профиль оформления и данные титульного листа обрабатываются в запросе и не сохраняются сервером. Прикреплённый в AI-клиенте образец обрабатывается средствами этого клиента; коннектор сам файл не скачивает.</p>
    <p>Использование информации Google API соответствует Google API Services User Data Policy, включая Limited Use. Данные не продаются, не используются для рекламы или обучения собственных моделей.</p>
    <p>Отключение и удаление доступны через инструмент disconnect_google или <a href="/account">управление подключением</a>. При недоступности Google удалите разрешение Classroom AI также в <a href="https://myaccount.google.com/permissions">настройках Google</a>.</p>
    <p>Оператор проекта: hak32204-eng. Вопросы: <a href="https://github.com/hak32204-eng/classroom-ai/issues">GitHub Issues</a>; не публикуйте там персональные данные и секреты. Сервис находится на стадии тестирования.</p>`);
  if(path==='/delete-data') return page('Удаление данных',`<p>Откройте <a href="/account">управление подключением</a> в браузере, где вы вошли, либо вызовите инструмент <code>disconnect_google</code> из подключённого клиента.</p><p>Будут удалены локальные Google-токены и браузерные сессии, а доступ клиентов к учебным данным перестанет работать. Сервер также попробует отозвать разрешение в Google. Если Google недоступен, удалите его вручную в <a href="https://myaccount.google.com/permissions">аккаунте Google</a>.</p><p>Истёкшие технические записи удаляются плановым обслуживанием. Cloudflare может сохранять резервные копии в соответствии со своими сроками хранения.</p>`);
  if(path==='/') return page('Classroom AI',`
    <style>
      body{max-width:920px;background:#f7f9fc;color:#18243a;margin:36px auto}h1{letter-spacing:-1.5px;font-size:42px;margin-bottom:8px}h2{font-size:25px;line-height:1.3}p{margin:12px 0}.badge{display:inline-block;background:#e5ecff;color:#2449a0;border-radius:24px;padding:5px 14px;font-size:14px;font-weight:600}.hero{font-size:27px;line-height:1.35;max-width:760px}.muted{color:#536078}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:28px 0}.card{background:white;border:1px solid #dce3ee;border-radius:18px;padding:20px}.card h2{font-size:20px;margin:8px 0}.number{font-size:14px;font-weight:700;color:#4369b0}.endpoint{background:#18243a;color:#fff;padding:20px;border-radius:14px;overflow-wrap:anywhere}.endpoint code{font-size:15px}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.actions a{background:#315ce5;color:white;text-decoration:none;padding:10px 18px;border-radius:10px}.actions a.secondary{background:white;color:#2449a0;border:1px solid #dce3ee}li{margin:10px 0}footer{font-size:14px;margin-top:36px;border-top:1px solid #dce3ee;padding-top:18px}@media(max-width:650px){.grid{grid-template-columns:1fr}body{margin:24px auto;padding:0 18px}h1{font-size:34px}.hero{font-size:23px}}
    </style>
    <span class="badge">Закрытый пилот · Только чтение</span>
    <p class="hero">От задания в Classroom — к понятному плану работы в ChatGPT.</p>
    <p class="muted">Найдите нужную практическую, уточните требования, выберите оформление и соберите основу работы. Без копирования задания между вкладками.</p>
    <div class="actions"><a href="#connect">Как подключить</a><a class="secondary" href="#workflow">Как это работает</a></div>
    <div class="grid" id="workflow">
      <section class="card"><span class="number">01 / ВЫБОР</span><h2>Найдите задание</h2><p>По предмету, названию или сроку. Ближайшие дедлайны, работы без срока и фильтр архивных курсов.</p></section>
      <section class="card"><span class="number">02 / ПОДГОТОВКА</span><h2>Задайте оформление</h2><p>Практическая, отчёт, презентация или конспект. Требования преподавателя или профиль по вашему образцу, титульный лист и личный срок подготовки.</p></section>
      <section class="card"><span class="number">03 / ПРОВЕРКА</span><h2>Проверьте результат</h2><p>Контекст задания, план, текстовый шаблон и чек-лист. Подготовка черновика и создание файла — средствами вашего AI-клиента.</p></section>
    </div>
    <section class="card"><h2>Начните с одной фразы</h2><ul><li>«Покажи задания на завтра. Мой часовой пояс — Москва».</li><li>«Найди ПР5 по сетям и помоги выбрать оформление».</li><li>«Используй оформление прикреплённой работы: шрифт, поля и титульник. Мои данные уточни отдельно».</li><li>«Подставь преподавателя из Classroom. Если их несколько — дай выбрать».</li></ul></section>
    <h2 id="connect">Подключение в ChatGPT</h2>
    <p>Откройте «Плагины» → «Добавить» → «Добавить пользовательский сервер MCP». Вставьте адрес, выберите OAuth и войдите в разрешённый Google-аккаунт.</p>
    <div class="endpoint"><code>https://classroom-ai.hak32204.workers.dev/mcp</code></div>
    <p class="muted">Сейчас доступны только Google-аккаунты, добавленные владельцем в тестовую группу. Доступность пользовательских MCP зависит от возможностей вашего AI-клиента и аккаунта. Проверка подключения Claude ещё не завершена.</p>
    <h2>Понятные границы</h2><ul><li>Задания читаются по запросу; сервер не хранит их постоянные копии.</li><li>Работы не отправляются преподавателю автоматически. Статус сдачи пока недоступен.</li><li>Ссылки на вложения доступны, но их содержимое этот коннектор пока не скачивает.</li><li>Мастер создаёт план и текстовый шаблон. Экспорт Word, PDF и PowerPoint требует соответствующих инструментов AI-клиента.</li><li>Отдельный платный AI API не используется. Тариф AI-клиента и ограничения хостинга действуют отдельно.</li></ul>
    <footer><a href="/privacy">Конфиденциальность</a> · <a href="/account">Управление доступом</a> · <a href="/delete-data">Удаление данных</a> · <a href="https://github.com/hak32204-eng/classroom-ai">Открытый код</a><p class="muted">Classroom AI — независимый проект. Он не является продуктом Google или OpenAI.</p></footer>`);
  return null;
}
