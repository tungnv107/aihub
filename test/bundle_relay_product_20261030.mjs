import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(new URL('./relay-product-build-tools/package.json',import.meta.url));
const esbuild=require('esbuild'),obfuscator=require('javascript-obfuscator');
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]);
fs.mkdirSync(path.join(out,'relay_product'),{recursive:true});
for(const entry of ['cli','proxy-server','proxy-init','proxy-admin']){
  const built=await esbuild.build({entryPoints:[path.join(root,'relay_product',entry+'.mjs')],bundle:true,write:false,minify:true,
    platform:'node',target:'node24',format:'esm',legalComments:'none',plugins:[{name:'factory-only',setup(build){
      build.onLoad({filter:/self_relay[\\/]server\.mjs$/},async(args)=>{
        const text=fs.readFileSync(args.path,'utf8');
        const index=text.indexOf('if(process.argv[1]&&');
        if(index<0)throw Error('server_entry_guard_not_found');
        return {contents:text.slice(0,index),loader:'js'};
      });
    }}]});
  const code=obfuscator.obfuscate(built.outputFiles[0].text,{target:'node',compact:true,seed:20261030,
    controlFlowFlattening:false,deadCodeInjection:false,debugProtection:false,selfDefending:false,
    renameGlobals:false,stringArray:true,stringArrayThreshold:0.65,sourceMap:false}).getObfuscatedCode();
  fs.writeFileSync(path.join(out,'relay_product',entry+'.mjs'),code+'\n');
}
fs.copyFileSync(path.join(root,'relay_product/device.ps1'),path.join(out,'relay_product/device.ps1'));
console.log(JSON.stringify({bundled:true,entries:4,sourceMaps:false,issuerIncluded:false}));
