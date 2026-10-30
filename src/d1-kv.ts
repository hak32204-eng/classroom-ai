import type { AuthDatabase } from './auth-storage.ts';

/** Implements the text/JSON KV subset used by pinned workers-oauth-provider 1.2.4.
 * D1 primary reads avoid KV propagation delays. Transactions are atomically consumed.
 */
export class D1OAuthStore {
  private db: AuthDatabase;
  constructor(db: AuthDatabase) { this.db=db; }
  async get(key: string, options?: { type?: string } | string): Promise<any> {
    const type = typeof options === 'string' ? options : options?.type;
    if (type && type !== 'text' && type !== 'json') throw new Error('Unsupported KV format');
    const query = key.startsWith('transaction:')
      ? 'DELETE FROM oauth_kv WHERE key = ? AND expires_at > ? RETURNING value'
      : 'SELECT value FROM oauth_kv WHERE key = ? AND expires_at > ?';
    const row = await this.db.prepare(query).bind(key, Math.floor(Date.now()/1000)).first<{value:string}>();
    if (!row) return null;
    return type === 'json' ? JSON.parse(row.value) : row.value;
  }
  async put(key: string, value: string, options: {expirationTtl?:number; expiration?:number; metadata?:unknown} = {}) {
    if (typeof value !== 'string') throw new Error('Only text values supported');
    const expiry = options.expiration ?? (options.expirationTtl === undefined ? 253402300799 : Math.floor(Date.now()/1000) + options.expirationTtl);
    await this.db.prepare('INSERT INTO oauth_kv (key,value,metadata,expires_at) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,metadata=excluded.metadata,expires_at=excluded.expires_at')
      .bind(key,value,JSON.stringify(options.metadata ?? null),expiry).run();
  }
  async delete(key: string) { await this.db.prepare('DELETE FROM oauth_kv WHERE key = ?').bind(key).run(); }
  async list(options: {prefix?:string;cursor?:string;limit?:number} = {}) {
    const prefix=options.prefix ?? '', cursor=options.cursor ?? '';
    const limit=Math.min(1000,Math.max(1,options.limit ?? 1000));
    // substr avoids SQL wildcard interpretation in a client-controlled prefix.
    const statement=this.db.prepare('SELECT key,metadata,expires_at FROM oauth_kv WHERE substr(key,1,?) = ? AND key > ? AND expires_at > ? ORDER BY key LIMIT ?')
      .bind(prefix.length,prefix,cursor,Math.floor(Date.now()/1000),limit+1);
    if (!statement.all) throw new Error('D1 all() unavailable');
    const rows=(await statement.all<{key:string;metadata:string;expires_at:number}>()).results;
    const complete=rows.length<=limit;
    const page=rows.slice(0,limit);
    return {keys:page.map(r=>({name:r.key,metadata:JSON.parse(r.metadata),expiration:r.expires_at})),
      list_complete:complete, cursor:complete?'':page[page.length-1].key, cacheStatus:null};
  }
}
