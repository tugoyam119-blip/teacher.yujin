/* eslint-disable @typescript-eslint/no-explicit-any */
import {aiConfig} from './grading';
import {V2_AREAS,V2_POLICY,validateV2Grade} from '../rubric-v2';
export async function aiGradeV2(answers:any,participation:any){
 const config=await aiConfig();if(!config.key)throw Error('OPENAI_API_KEY가 연결되지 않았습니다.');
 const properties=Object.fromEntries(V2_AREAS.map(area=>[area.key,{type:'object',properties:{score:{type:'integer',minimum:0,maximum:area.max},reason:{type:'string'},deduction:{type:'string'},evidence:{type:'array',items:{type:'string'}}},required:['score','reason','deduction','evidence'],additionalProperties:false}]));
 const schema={type:'object',properties:{areas:{type:'object',properties,required:V2_AREAS.map(x=>x.key),additionalProperties:false},confidence:{type:'string',enum:['high','medium','low']},reviewFlags:{type:'array',items:{type:'string'}},feedback:{type:'string'},strength:{type:'string'},improvement:{type:'string'}},required:['areas','confidence','reviewFlags','feedback','strength','improvement'],additionalProperties:false};
 const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',signal:AbortSignal.timeout(55000),headers:{authorization:`Bearer ${config.key}`,'content-type':'application/json'},body:JSON.stringify({model:config.model,store:false,input:[{role:'system',content:V2_POLICY+'\n영역별 수준 구간: '+JSON.stringify(V2_AREAS.map(({key,label,max,bands})=>({key,label,max,bands})))},{role:'user',content:JSON.stringify({answers,participation})}],text:{format:{type:'json_schema',name:'exchange_rubric_v2',strict:true,schema}}})});
 if(!response.ok)throw Error(`AI 요청 실패 (${response.status})`);
 const data:any=await response.json(),text=data.output?.flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('');
 if(!text)throw Error('AI 응답을 읽을 수 없습니다.');
 return validateV2Grade(JSON.parse(text),answers);
}
