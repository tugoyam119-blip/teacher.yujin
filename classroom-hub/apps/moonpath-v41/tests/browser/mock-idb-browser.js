/** Browser DOM integration ONLY. Memory IDB substitute; NEVER production or native-IDB evidence. */
(()=>{
 const clone=v=>structuredClone(v);
 const dbs=new Map();
 class Request {constructor(){this.result=undefined;this.error=null;this.onsuccess=null;this.onerror=null;this.onupgradeneeded=null;this.onblocked=null;}}
 class Tx {
  constructor(db,names,mode){this.db=db;this.mode=mode;this.data=new Map(names.map(n=>[n,new Map([...db.data.get(n)].map(([k,v])=>[k,clone(v)]))]));this.outstanding=0;this.aborted=false;this.completed=false;this.finishScheduled=false;}
  objectStore(name){if(!this.data.has(name))throw Error('Store not in transaction');return new Store(this,name);}
  abort(){if(this.aborted||this.completed)return;this.aborted=true;queueMicrotask(()=>this.onabort?.());}
  _run(fn){if(this.aborted||this.completed)throw Error('TransactionInactiveError');const r=new Request();this.outstanding++;
   queueMicrotask(()=>{if(this.aborted)return;try{r.result=clone(fn());r.onsuccess?.({target:r});}catch(e){r.error=e;r.onerror?.({target:r});this.abort();}this.outstanding--;this._finish();});return r;}
  _finish(){if(this.aborted||this.completed||this.outstanding||this.finishScheduled)return;this.finishScheduled=true;
   setTimeout(()=>{this.finishScheduled=false;if(this.aborted||this.completed||this.outstanding)return this._finish();
    if(this.mode==='readwrite')for(const [k,v] of this.data)this.db.data.set(k,v);this.completed=true;this.oncomplete?.();},0);
  }
 }
 class Store {constructor(tx,name){this.tx=tx;this.name=name;}get(key){return this.tx._run(()=>this.tx.data.get(this.name).get(key));}
  getAll(){return this.tx._run(()=>[...this.tx.data.get(this.name).values()]);}
  add(v){return this.tx._run(()=>{const m=this.tx.data.get(this.name);if(m.has(v.key))throw Error('ConstraintError');m.set(v.key,clone(v));return v.key;});}
  put(v){return this.tx._run(()=>{this.tx.data.get(this.name).set(v.key,clone(v));return v.key;});}
  delete(key){return this.tx._run(()=>this.tx.data.get(this.name).delete(key));}
 }
 class Db {constructor(name){this.name=name;this.data=new Map();this.version=0;this.objectStoreNames={contains:n=>this.data.has(n)};}
  createObjectStore(n){this.data.set(n,new Map());}
  transaction(names,mode){return new Tx(this,names,mode);}
  close(){}
 }
 const fake={open(name,version){const req=new Request();queueMicrotask(()=>{
   const db=dbs.get(name)??new Db(name),newVersion=version??1;
   if(!dbs.has(name))dbs.set(name,db);
   const upgrade=db.version<newVersion;req.result=db;
   if(upgrade){db.version=newVersion;req.onupgradeneeded?.({target:req});}
   req.onsuccess?.({target:req});
  });return req;},
  deleteDatabase(){throw Error('Delete unsupported in mock. Never call on old DB.');}
 };
 Object.defineProperty(window,'indexedDB',{configurable:true,value:fake});
 window.__MP_FAKE_BROWSER_DB__=true;
})();
