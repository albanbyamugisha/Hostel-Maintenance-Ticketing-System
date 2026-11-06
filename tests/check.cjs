const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.chdir(path.resolve(__dirname,'..'));
const root=process.cwd(),modules=new Map();
for(const dir of ['js','js/components','js/pages'])for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('.js'))){const file=path.resolve(dir,f);modules.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{identifier:file}));}
(async()=>{for(const m of modules.values()){if(m.status==='unlinked')await m.link((specifier,parent)=>{const target=path.resolve(path.dirname(parent.identifier),specifier);if(!modules.has(target))throw Error('Missing module '+target);return modules.get(target)});}console.log(`Linked ${modules.size} modules successfully`);
new vm.Script(fs.readFileSync('sw.js','utf8'));
const assets=[...fs.readFileSync('sw.js','utf8').matchAll(/^  "(\.\/[^"\n]+)"/gm)].map(m=>m[1]);
for(const asset of assets)if(!fs.existsSync(asset))throw Error('Missing precached asset: '+asset);
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
for(const icon of manifest.icons)if(!fs.existsSync(icon.src))throw Error('Missing icon: '+icon.src);
console.log(`Service worker syntax, ${assets.length} cached assets and manifest verified`);})().catch(e=>{console.error(e);process.exitCode=1});
