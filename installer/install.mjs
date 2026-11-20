import {existsSync,readdirSync,mkdirSync,copyFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url));
const archives=readdirSync(root).filter(n=>/^dsh-dim-womb-\d+\.\d+\.\d+\.tgz$/.test(n));
if(archives.length!==1)throw Error('Expected exactly one dsh-dim-womb versioned TGZ beside install.mjs.');
const candidates=[process.argv[2],process.env.DSH_CLI,
  join(dirname(process.execPath),'node_modules/@deepseek-ai/dsh/lib/bin.js'),
  join(process.env.APPDATA || join(homedir(),'AppData/Roaming'),'npm/node_modules/@deepseek-ai/dsh/lib/bin.js'),
  ...'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(d=>d+':/deepseek/DSHLauncher/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js')];
const cli=candidates.find(p=>p && existsSync(p));
if(!cli){
  console.error('DSH CLI not found. Run: node install.mjs <path-to-dsh/lib/bin.js>');
  console.error('Or run in this folder: dsh plugin --profile web add ./'+archives[0]);
  process.exitCode=1;
}else{
  const home=process.env.DSH_HOME?.trim()?resolve(process.env.DSH_HOME):join(homedir(),'.dsh');
  const target=join(home,'local-packages',archives[0]);
  mkdirSync(dirname(target),{recursive:true});
  copyFileSync(join(root,archives[0]),target);
  const profile=join(home,'profiles','web');
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  for(const name of ['package.json','pnpm-lock.yaml','cordis.patch.yml']){
    const file=join(profile,name);if(existsSync(file))copyFileSync(file,file+'.bak-whale-'+stamp);
  }
  const result=spawnSync(process.execPath,[cli,'plugin','--profile','web','add',target],{stdio:'inherit'});
  if(result.error)console.error(result.error.message);
  process.exitCode=result.status ?? 1;
  if(process.exitCode===0)console.log('Installed. Restart DSH Web, then refresh your original browser tab.');
}
