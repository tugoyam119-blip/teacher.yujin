"use client";
import {useEffect,useRef,useState} from 'react';

export function useTeacherConfirmation() {
  const [question,setQuestion]=useState<{message:string;text:boolean}|null>(null);
  const [value,setValue]=useState('');
  const resolve=useRef<((value:any)=>void)|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  function finish(value:any){const done=resolve.current;resolve.current=null;setQuestion(null);done?.(value);}
  function request(message:string,text=false):Promise<any>{
    if(resolve.current)return Promise.resolve(text?null:false);
    setValue('');setQuestion({message,text});
    return new Promise(done=>{resolve.current=done});
  }
  useEffect(()=>{if(question)dialog.current?.showModal();else dialog.current?.close()},[question]);
  useEffect(()=>()=>resolve.current?.(null),[]);
  const confirmation=<dialog ref={dialog} className="teacher-confirm" aria-labelledby="teacher-confirm-title" onCancel={e=>{e.preventDefault();finish(null)}}>
    <form onSubmit={e=>{e.preventDefault();finish(question?.text?value:true)}}>
      <h2 id="teacher-confirm-title">실행 내용 확인</h2>
      <p>{question?.message}</p>
      {question?.text&&<label>확인 문구<input value={value} onChange={e=>setValue(e.target.value)} autoComplete="off"/></label>}
      <div><button type="button" autoFocus onClick={()=>finish(null)}>취소</button><button type="submit" className="primary">확인하고 실행</button></div>
    </form>
  </dialog>;
  return {ask:(message:string)=>request(message),askText:(message:string)=>request(message,true),confirmation};
}
