import {execFileSync} from 'node:child_process';
// D1 --file is an import operation: its progress output is not query JSON.
// Read-only commands must use --command to return their result rows.
export function executeD1(sql,file,{cwd,run=execFileSync}={}){
 const readOnly=/^(SELECT|PRAGMA)\b/i.test(sql.trim());
 const args=['wrangler','d1','execute','internmatch','--remote','--json',...(readOnly?['--command',sql]:['--file',file])];
 const output=run('npx',args,{cwd,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
 return readOnly?JSON.parse(output):[];
}
