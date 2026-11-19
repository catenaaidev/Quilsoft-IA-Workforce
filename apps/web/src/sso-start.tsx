import { useEffect, useState } from 'react';
const BESA_PORTAL='https://besa-identidad-central.besa-junin.workers.dev/';
export function SsoStart(){
  const [error,setError]=useState('');
  useEffect(()=>{
    const ticket=window.location.hash.replace(/^#/,'');
    window.history.replaceState(null,'','/sso/start');
    if(!/^[A-Za-z0-9_-]{43}$/.test(ticket)) {setError('El pase de acceso no es válido o ya venció.');return;}
    const abort=new AbortController();
    fetch('/api/sso/exchange',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({ticket}),signal:abort.signal})
      .then(async r=>{if(!r.ok)throw Error(`Error de SSO (${r.status})`);window.location.replace('/');})
      .catch(e=>{if(!abort.signal.aborted)setError(String(e.message||e));});
    return()=>abort.abort();
  },[]);
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="panel max-w-md space-y-4 p-8 text-center"><h1 className="text-xl font-bold">Acceso central BESA</h1>{error?<><p className="text-red-700">{error}</p><a className="btn-primary inline-flex" href={BESA_PORTAL}>Volver al menú central</a></>:<p>Validando tu acceso a IA Workforce…</p>}</div></main>;
}
