const {spawn}=require('child_process');
const path=require('path');
const procs=[];
function run(name,cwd,port){const p=spawn(process.execPath,['server.js'],{cwd,env:{...process.env,PORT:String(port)},stdio:'inherit'});p.on('exit',c=>console.log(`[${name}] 종료 ${c}`));procs.push(p)}
run('classroom',path.join(__dirname,'classroom-hub'),3000);
run('human-rights',path.join(__dirname,'services','human-rights'),3004);
console.log('\n유진T 클래스룸 v3 로컬 주소: http://localhost:3000');
console.log('인권 수행평가 로컬 주소: http://localhost:3004\n');
process.on('SIGINT',()=>{for(const p of procs)p.kill('SIGINT');process.exit()});
