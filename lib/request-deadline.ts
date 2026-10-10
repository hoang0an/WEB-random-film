export class RequestTimeoutError extends Error {
  constructor() {super('request_timeout'); this.name='RequestTimeoutError';}
}

// Bound the entire SDK operation, including waiting for session/headers before
// fetch. Abort transport where possible; a server may still commit a mutation.
export async function withRequestDeadline<T>(operation:(signal:AbortSignal)=>PromiseLike<T>,milliseconds=15000):Promise<T> {
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{
    timer=setTimeout(()=>{reject(new RequestTimeoutError());controller.abort();},milliseconds);
  });
  try {return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),deadline]);}
  finally {clearTimeout(timer);}
}
