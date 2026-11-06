import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {VERSION} from '../ch_relay/settings.mjs';
import {normalizeServer} from '../ch_relay/sub2api-license.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'dist/npm');
const args=process.argv.slice(2);
const options={};
while(args.length){const flag=args.shift();if(flag==='--publish-ready'){options[flag]=true;continue;}if(!['--server','--package-name'].includes(flag)||!args[0]||options[flag])throw Error('usage: node scripts/build-npm.mjs [--server https://aihub.example.com] [--package-name @username/aihub] [--publish-ready]');options[flag]=args.shift();}
const server=options['--server']?normalizeServer(options['--server']):'';
const packageName=options['--package-name']??'aihub-local';
if(!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(packageName)||packageName==='aihub')throw Error('Choose an available npm package name, such as @your-username/aihub; aihub is owned by another publisher.');
if(options['--publish-ready']&&(!options['--package-name']||!server))throw Error('A publish-ready build requires --package-name and --server');
const require=createRequire(new URL('../test/relay-product-build-tools/package.json',import.meta.url));
const esbuild=require('esbuild');
fs.mkdirSync(path.join(out,'bin'),{recursive:true});
await esbuild.build({entryPoints:[path.join(root,'ch_relay/cli.mjs')],outfile:path.join(out,'bin/ch-relay.mjs'),bundle:true,minify:true,
  platform:'node',target:'node24',format:'esm',legalComments:'none',define:{__CH_RELAY_SERVER__:JSON.stringify(server)}});
fs.copyFileSync(path.join(root,'ch_relay/device.ps1'),path.join(out,'bin/device.ps1'));
fs.chmodSync(path.join(out,'bin/ch-relay.mjs'),0o755);
fs.copyFileSync(path.join(root,'docs/CH-RELAY-NPM.md'),path.join(out,'README.md'));
fs.writeFileSync(path.join(out,'package.json'),JSON.stringify({name:packageName,version:VERSION,private:!options['--publish-ready'],type:'module',license:'UNLICENSED',
  description:'AIHub — local AI workspace with expiring Sub2API access keys',engines:{node:'>=24.18.0'},bin:{aihub:'bin/ch-relay.mjs','ch-relay':'bin/ch-relay.mjs'},publishConfig:{access:'public'},
  files:['bin/ch-relay.mjs','bin/device.ps1','README.md']},null,2)+'\n');
// No lifecycle/install script, issuer, upstream checkout, account DB or credentials in this package.
const npmCli=process.env.npm_execpath??path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
const result=spawnSync(process.execPath,[npmCli,'pack','--ignore-scripts','--json','--pack-destination',path.join(root,'dist')],{cwd:out,encoding:'utf8',windowsHide:true});
if(result.status!==0){process.stderr.write(result.stderr);process.exitCode=1;}
else{
  const pack=JSON.parse(result.stdout)[0];
  const allowed=new Set(['package.json','README.md','bin/ch-relay.mjs','bin/device.ps1']);
  if(pack.files.some(file=>!allowed.has(file.path)))throw Error('unexpected_file_in_npm_package');
  console.log(JSON.stringify({file:path.join(root,'dist',pack.filename),integrity:pack.integrity,files:pack.files.map(file=>file.path),server:server||'configured_at_login',published:false},null,2));
}
