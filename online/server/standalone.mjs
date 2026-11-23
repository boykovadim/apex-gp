// Single-instance server for free hosting. Only active rooms live in memory.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WebSocketServer} from 'ws';
import worker,{attachRelay} from './index.js';

const root=fileURLToPath(new URL('../public/',import.meta.url));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../drizzle/0000_race.sql',import.meta.url),'utf8'));
const db={
  prepare(sql){return {bind(...args){
    const stmt=sqlite.prepare(sql);
    const all=()=>({results:stmt.all(...args)});
    const run=()=>({meta:stmt.run(...args)});
    return {first:()=>stmt.get(...args),all,run,execute:()=>stmt.columns().length?all():run()};
  }};},
  batch(ops){
    sqlite.exec('BEGIN');
    try{const result=ops.map(op=>op.execute());sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }
};
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
function origin(req){
  const proto=req.socket.encrypted || req.headers['x-forwarded-proto']?.split(',')[0]==='https'?'https':'http';
  return proto+'://'+req.headers.host;
}
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin(req));
    if(url.pathname.startsWith('/api/')){
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>180000){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request(url,{method:req.method,headers:req.headers,body:chunks.length?Buffer.concat(chunks):undefined});
      const response=await worker.fetch(request,{DB:db});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const name=decodeURIComponent(url.pathname);
    const path=resolve(root,'.'+(name.endsWith('/')?name+'index.html':name));
    if(!path.startsWith(resolve(root)+sep)){res.writeHead(404).end();return;}
    const info=await stat(path);
    if(!info.isFile()){res.writeHead(404).end();return;}
    res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Content-Length':info.size});
    if(req.method==='HEAD')res.end();else createReadStream(path).on('error',()=>res.destroy()).pipe(res);
  } catch(error){if(!res.headersSent)res.writeHead(error.code==='ENOENT'?404:400);res.end();}
});
const ws=new WebSocketServer({noServer:true,maxPayload:32768,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  if(req.url!=='/api/live' || req.headers.origin!==origin(req)){socket.destroy();return;}
  ws.handleUpgrade(req,socket,head,client=>attachRelay(client,db));
});
server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log('Apex GP listening on',server.address().port));
