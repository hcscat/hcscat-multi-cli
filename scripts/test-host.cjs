const {runTests}=require('@vscode/test-electron');
const path=require('node:path');
const fs=require('node:fs/promises');
(async()=>{
  const root=path.resolve(__dirname,'..');
  const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const installed=process.argv.includes('--installed');
  const profile=path.join(root,'.local',installed?'installed-profile':'host-profile');
  await fs.mkdir(path.join(profile,'User'),{recursive:true});
  await fs.writeFile(path.join(profile,'User','settings.json'),JSON.stringify({'security.workspace.trust.enabled':false,'workbench.startupEditor':'none','extensions.autoUpdate':false,'telemetry.telemetryLevel':'off','update.mode':'none'}));
  const extensions=path.join(root,'.local',installed?'installed-extensions':'host-extensions');
  let development=root;
  if(installed) {
    development=path.join(root,'.local','test-driver');await fs.mkdir(development,{recursive:true});
    await fs.writeFile(path.join(development,'package.json'),JSON.stringify({name:'multi-cli-test-driver',version:'0.0.1',publisher:'local-test',engines:{vscode:'^1.100.0'}}));
    const {spawnSync}=require('node:child_process');
    const code=process.env.MULTI_CLI_CODE_EXE||'C:\\Program Files\\Microsoft VS Code\\Code.exe';
    const codeRoot=path.dirname(code);
    const wrapper=await fs.readFile(path.join(codeRoot,'bin','code.cmd'),'utf8');
    const relativeCli=wrapper.match(/%~dp0\.\.\\([^"\r\n]+cli\.js)/)?.[1];
    if(!relativeCli)throw new Error('Cannot resolve installed VS Code CLI entrypoint');
    const install=spawnSync(code,[path.join(codeRoot,relativeCli),'--user-data-dir',profile,'--extensions-dir',extensions,'--install-extension',path.join(root,'release',version,`multi-cli-win32-x64-${version}.vsix`),'--force'],{encoding:'utf8',windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeout:30000});
    console.log(install.stdout);if(install.status!==0)throw new Error('VSIX install failed: '+install.stderr);
  }
  await runTests({vscodeExecutablePath:process.env.MULTI_CLI_CODE_EXE || 'C:\\Program Files\\Microsoft VS Code\\Code.exe',extensionDevelopmentPath:development,extensionTestsPath:path.join(root,'test','host.cjs'),launchArgs:[root,'--user-data-dir',profile,'--extensions-dir',extensions,...(installed?[]:['--disable-extensions']),'--skip-welcome','--skip-release-notes','--disable-updates']});
})().catch(e=>{console.error(e);process.exitCode=1});
