import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function database() {
  const sql=new DatabaseSync(':memory:');
  for(const file of ['0001_auth.sql','0002_mcp.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){return {
    async run(){const meta=sql.prepare(query).run(...args);return {meta};},
    async first(){return sql.prepare(query).get(...args)??null;},
    async all(){return {results:sql.prepare(query).all(...args)};},
  };}};}};
  return {sql,db};
}
