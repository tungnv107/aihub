import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.TDH_PUBLIC_ROOT??'/srv/public');
const types={'.html':'text/html; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8',
  '.ps1':'text/plain; charset=utf-8','.sh':'text/plain; charset=utf-8','.mjs':'text/plain; charset=utf-8','.json':'application/json','.zip':'application/zip','.gz':'application/gzip'};
http.createServer((req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/healthz'){res.writeHead(200,{'content-type':'application/json'});res.end('{"ok":true,"service":"tdh-relay-distribution"}');return;}
    if(fs.existsSync(path.join(root,'maintenance.flag'))){
      res.writeHead(503,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','retry-after':'300'});
      res.end('TDH Relay: đang hoàn thiện bản có key kích hoạt. Bộ cài sẽ được mở lại sau khi kiểm thử.');return;
    }
    let relative=decodeURIComponent(url.pathname).replace(/^\/+/,'')||'index.html';
    if(['setup.ps1','setup.sh'].includes(relative)&&url.searchParams.get('remove')==='1')relative=relative.replace('setup','uninstall');
    const target=path.resolve(root,relative);
    if(!target.startsWith(root+path.sep)||fs.lstatSync(target).isSymbolicLink()||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
    const stat=fs.statSync(target);
    res.writeHead(200,{'content-type':types[path.extname(target)]??'application/octet-stream','content-length':stat.size,
      'cache-control':relative.startsWith('releases/')?'public, max-age=31536000, immutable':'no-store',
      'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"});
    if(req.method==='HEAD')res.end();else fs.createReadStream(target).pipe(res);
  }catch{res.writeHead(404);res.end();}
}).listen(Number(process.env.PORT??8080),'0.0.0.0');
