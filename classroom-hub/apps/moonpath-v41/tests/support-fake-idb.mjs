/** Deliberately small IN-MEMORY IndexedDB transaction stand-in, solely for adapter unit tests.
 * NEVER treat its results as actual Chrome/Edge IndexedDB or file:// validation.
 */
const copy=v=>structuredClone(v);
export class FakeDatabase {
  constructor(){this.stores=new Map(['slots','events','checkpoints','leases','quarantine','archives'].map(n=>[n,new Map()]));this.failNextWrite=false;this.closed=false;}
  close(){this.closed=true;}
  transaction(names,mode){
    if(this.closed)throw new Error('Database closed');
    return new FakeTransaction(this,names,mode);
  }
  inspect(name,key){return copy(this.stores.get(name).get(key));}
  alter(name,key,value){this.stores.get(name).set(key,copy(value));}
}
class FakeTransaction {
  constructor(db,names,mode){
    this.db=db;this.mode=mode;this.names=names;
    this.data=new Map(names.map(n=>[n,new Map([...db.stores.get(n)].map(([k,v])=>[k,copy(v)]))]));
    this.outstanding=0;this.aborted=false;this.completed=false;this.finishScheduled=false;this.onerror=null;this.onabort=null;this.oncomplete=null;
  }
  objectStore(name){if(!this.data.has(name))throw new Error('Store not in transaction');return new FakeStore(this,name);}
  abort(){if(this.aborted||this.completed)return;this.aborted=true;queueMicrotask(()=>this.onabort?.());}
  _run(fn){
    if(this.aborted||this.completed)throw new Error('Transaction inactive');
    const req={result:undefined,error:null,onsuccess:null,onerror:null};
    this.outstanding++;
    queueMicrotask(()=>{
      if(this.aborted)return;
      try{req.result=copy(fn());req.onsuccess?.({target:req});}
      catch(err){req.error=err;req.onerror?.({target:req});this.abort();}
      this.outstanding--;this._maybeFinish();
    });
    return req;
  }
  _maybeFinish(){
    if(this.aborted||this.completed||this.outstanding||this.finishScheduled)return;
    this.finishScheduled=true;
    setImmediate(()=>{
      this.finishScheduled=false;
      if(this.aborted||this.completed||this.outstanding)return this._maybeFinish();
      if(this.mode==='readwrite'&&this.db.failNextWrite){
        this.db.failNextWrite=false;
        this.error=Object.assign(new Error('Simulated quota failure'),{name:'QuotaExceededError'});
        return this.abort();
      }
      if(this.mode==='readwrite')for(const name of this.names)this.db.stores.set(name,this.data.get(name));
      this.completed=true;this.oncomplete?.();
    });
  }
}
class FakeStore {
  constructor(tx,name){this.tx=tx;this.name=name;}
  _data(){return this.tx.data.get(this.name);}
  get(key){return this.tx._run(()=>this._data().get(key));}
  getAll(){return this.tx._run(()=>[...this._data().values()]);}
  put(value){if(this.tx.mode!=='readwrite')throw new Error('readonly');return this.tx._run(()=>{this._data().set(value.key,copy(value));return value.key;});}
  add(value){if(this.tx.mode!=='readwrite')throw new Error('readonly');return this.tx._run(()=>{if(this._data().has(value.key))throw new Error('ConstraintError');this._data().set(value.key,copy(value));return value.key;});}
  delete(key){if(this.tx.mode!=='readwrite')throw new Error('readonly');return this.tx._run(()=>this._data().delete(key));}
}
