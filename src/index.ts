/**
 * Classroom AI - MCP over Streamable HTTP.
 * This milestone has NO Google OAuth and cannot read private classroom data.
 */
interface Env {}
type Id = string | number | null;
type Req = { jsonrpc?: string; id?: Id; method?: string; params?: unknown };
const PROTOCOL = "2025-03-26";
const headers = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, accept, mcp-protocol-version", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
function result(id: Id, value: unknown): Response {
  return new Response(JSON.stringify({jsonrpc:"2.0", id, result:value}), {headers});
}
function failure(id: Id, code: number, message: string, status=200): Response {
  return new Response(JSON.stringify({jsonrpc:"2.0", id, error:{code,message}}), {status, headers});
}
export default {
  async fetch(req: Request, _env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null,{status:204,headers});
    if (url.pathname === "/health" && req.method === "GET") return Response.json({ok:true,googleConnected:false});
    if (url.pathname !== "/mcp") return new Response("Not found",{status:404});
    if (req.method === "GET") return new Response("SSE is not available in this stateless prototype",{status:405,headers});
    if (req.method !== "POST") return new Response("Method not allowed",{status:405,headers});
    let msg: Req;
    try { msg = await req.json() as Req; }
    catch {return failure(null,-32700,"Parse error",400);}
    if (!msg || typeof msg !== "object" || Array.isArray(msg) ||
        msg.jsonrpc !== "2.0" || typeof msg.method !== "string" ||
        (msg.id !== undefined && msg.id !== null && typeof msg.id !== "string" && typeof msg.id !== "number"))
      return failure(null,-32600,"Invalid request",400);
    if (msg.id === undefined) return new Response(null,{status:202,headers});
    const id=msg.id;
    switch(msg.method){
      case "initialize":
        return result(id,{protocolVersion:PROTOCOL,capabilities:{tools:{listChanged:false}},serverInfo:{name:"classroom-ai",version:"0.1.0"},instructions:"Prototype: Google account integration is not configured."});
      case "ping": return result(id,{});
      case "tools/list":
        return result(id,{tools:[
          {name:"connection_status",description:"Report Google Classroom connection status",inputSchema:{type:"object",properties:{},additionalProperties:false}},
          {name:"list_courses",description:"List Classroom courses (unavailable until OAuth is configured)",inputSchema:{type:"object",properties:{},additionalProperties:false}}
        ]});
      case "tools/call": {
        const p=msg.params as {name?:string}|undefined;
        if(p?.name==="connection_status") return result(id,{content:[{type:"text",text:"Google Classroom is not connected. OAuth configuration is required."}]});
        if(p?.name==="list_courses") return result(id,{isError:true,content:[{type:"text",text:"Not connected to Google Classroom. No courses were retrieved."}]});
        return failure(id,-32602,"Unknown tool");
      }
      default: return failure(id,-32601,"Method not found");
    }
  }
};
