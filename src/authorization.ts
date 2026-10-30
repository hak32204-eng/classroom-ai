import { AuthorizationError, CimdFetchError, authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import { generateOpaqueToken, pkceChallenge, googleAuthorizationUrl, exchangeGoogleCode } from './google-oauth.ts';
import { sha256hex } from './auth-storage.ts';
import { googleSubject, connectAccount, disconnectAccount, accountExists } from './google-account.ts';
import { ORIGIN, googleConfig } from './env.ts';
import type { Env, AccountProps } from './env.ts';
import { page, escapeHtml, infoPage } from './pages.ts';

const cookieName='__Host-classroom-session';
async function browserAccount(request:Request,env:Env):Promise<AccountProps|null> {
  const cookie=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if (!cookie || !/^[\w-]{43}$/.test(cookie)) return null;
  const row=await env.DB.prepare('SELECT user_id,credential_version FROM web_sessions WHERE session_hash = ? AND expires_at > ?')
    .bind(await sha256hex(cookie),Math.floor(Date.now()/1000)).first<{user_id:string;credential_version:string}>();
  if (!row) return null;
  const props={userId:row.user_id,version:row.credential_version};
  return await accountExists(env,props)?props:null;
}
async function csrfToken(request:Request) { return sha256hex('account-disconnect.'+(request.headers.get('cookie')??'')); }
export async function authorizationRoutes(request:Request,env:Env):Promise<Response> {
  const url=new URL(request.url), oauth=env.OAUTH_PROVIDER;
  if(request.method==='GET') {const info=infoPage(url.pathname);if(info)return info;}
  try {
    if(url.pathname==='/authorize' && request.method==='GET') {
      const original=await oauth.parseAuthRequest(request);
      if(original.codeChallengeMethod!=='S256' || !original.codeChallenge) return page('PKCE required','<p>Подключение требует PKCE S256.</p>',undefined,400);
      const scopes=original.scope.length?original.scope:['classroom:read'];
      if(scopes.some(s=>!['classroom:read','offline_access'].includes(s)) || !scopes.includes('classroom:read')) return page('Unsupported scope','<p>Доступен только classroom:read.</p>',undefined,400);
      original.scope=scopes;
      const details=await oauth.describeConsent(original);
      const consent=await oauth.beginConsent(original);
      return page('Подключение Classroom AI',`<p>Клиент <strong>${escapeHtml(details.clientName)}</strong> просит читать ваши курсы, описания заданий, сроки и ссылки на материалы Google Classroom.</p>
        <p>Адрес возврата: <strong>${escapeHtml(details.redirectHost)}</strong>. ${details.clientDomain?'Домен клиента: '+escapeHtml(details.clientDomain):'Название клиента указано им самим и не подтверждено.'}</p>
        ${details.redirectIsLoopback?'<p><strong>Доступ получит приложение на вашем компьютере.</strong></p>':''}
        <p>Разрешения: ${scopes.map(escapeHtml).join(', ')}. Отправка учебных работ не разрешается.</p>
        <p>Продолжайте только если вы сами начали подключение в нужном клиенте. <a href="/privacy">Конфиденциальность</a>.</p>
        <form method="post" action="/authorize"><input type="hidden" name="handle" value="${escapeHtml(consent.handle)}"><p><label><input type="checkbox" name="includeTeachers" value="yes"> Автозаполнение преподавателя для титульного листа</label></p><p>Необязательно: Google запросит classroom.rosters.readonly — чтение состава курсов, включая преподавателей и учащихся. Этот коннектор использует его только для чтения имён преподавателей и передаёт их выбранному AI-клиенту. Без этого разрешения имя можно указать вручную или взять из подтверждённого образца.</p><button name="decision" value="approve">Продолжить с Google</button><button name="decision" value="deny">Отмена</button></form>`,consent.headers,200,original.redirectUri);
    }
    if(url.pathname==='/authorize' && request.method==='POST') {
      if(request.headers.get('origin')!==ORIGIN) return new Response('Forbidden',{status:403});
      const form=await request.formData(), handle=String(form.get('handle')??'');
      if(form.get('decision')!=='approve') {
        const denied=await oauth.denyConsent(request,handle);
        return new Response(null,{status:302,headers:denied.headers});
      }
      const approved=await oauth.approveConsent(request,handle);
      const verifier=generateOpaqueToken(48), nonce=generateOpaqueToken();
      const next=await oauth.beginUpstream(approved.request,{data:{verifier,nonce},headers:approved.headers});
      const config=googleConfig(env);
      const google=new URL(googleAuthorizationUrl(config.clientId,config.redirectUri,next.state,await pkceChallenge(verifier),form.get('includeTeachers')==='yes'));
      google.searchParams.set('scope','openid '+google.searchParams.get('scope'));
      google.searchParams.set('nonce',nonce);
      next.headers.set('location',google.toString());
      return new Response(null,{status:302,headers:next.headers});
    }
    if(url.pathname==='/auth/google/callback' && request.method==='GET') {
      const next=await oauth.finishUpstream<{verifier:string;nonce:string}>(request);
      if(url.searchParams.has('error')) {
        next.headers.set('location',authorizationErrorRedirect(next.request,'access_denied'));
        return new Response(null,{status:302,headers:next.headers});
      }
      const code=url.searchParams.get('code');
      if(!code || code.length>4096) return page('Ошибка входа','<p>Начните подключение заново.</p>',next.headers,400);
      const config=googleConfig(env);
      const tokens=await exchangeGoogleCode(code,next.data.verifier,config);
      const userId=await googleSubject(tokens,next.data.nonce,config.clientId);
      const props=await connectAccount(env,userId,tokens);
      const completed=await oauth.completeAuthorization({request:next.request,userId,metadata:{},scope:next.request.scope,props});
      const session=generateOpaqueToken();
      await env.DB.prepare('INSERT INTO web_sessions (session_hash,user_id,credential_version,expires_at) VALUES (?,?,?,?)')
        .bind(await sha256hex(session),userId,props.version,Math.floor(Date.now()/1000)+86400).run();
      next.headers.append('set-cookie',cookieName+'='+session+'; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=86400');
      next.headers.set('location',completed.redirectTo);
      return new Response(null,{status:302,headers:next.headers});
    }
    if(url.pathname==='/account' && request.method==='GET') {
      const props=await browserAccount(request,env);
      if(!props) return page('Подключение Google','<p>Действующего подключения в этом браузере нет. Начните подключение из своего MCP-клиента или удалите доступ в <a href="https://myaccount.google.com/permissions">аккаунте Google</a>.</p>');
      return page('Управление подключением',`<p>Google подключён. Отключение удалит локальные данные авторизации и закроет доступ к Classroom для подключённых клиентов.</p><form method="post" action="/account/disconnect"><input type="hidden" name="csrf" value="${await csrfToken(request)}"><button>Отключить Google и удалить данные</button></form>`);
    }
    if(url.pathname==='/account/disconnect' && request.method==='POST') {
      if(request.headers.get('origin')!==ORIGIN) return new Response('Forbidden',{status:403});
      const props=await browserAccount(request,env),form=await request.formData();
      if(!props || form.get('csrf')!==await csrfToken(request)) return new Response('Forbidden',{status:403});
      const result=await disconnectAccount(env,props);
      const headers=new Headers({'set-cookie':cookieName+'=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'});
      return page('Подключение удалено','<p>'+escapeHtml(result.message)+'</p>',headers);
    }
    return new Response('Not found',{status:404});
  } catch(error) {
    if(error instanceof AuthorizationError && error.redirectTo && url.pathname==='/authorize' && request.method==='GET') return Response.redirect(error.redirectTo,302);
    if(error instanceof AuthorizationError || error instanceof CimdFetchError) return page('Не удалось подтвердить подключение','<p>Запрос истёк или не прошёл проверку. Начните подключение заново из своего клиента.</p>',undefined,400);
    // Never serialize upstream errors, tokens, state, code or configuration.
    return page('Подключение временно недоступно','<p>Проверьте настройки сервиса или повторите подключение позже.</p>',undefined,503);
  }
}
