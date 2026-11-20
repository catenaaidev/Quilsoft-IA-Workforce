import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {Notice} from './components';
type Result={sku:string;status:string;stage:string;source:string;canAuthorize:boolean};
export function LoyalSimulator(){const me=useQuery({queryKey:['me'],queryFn:()=>api<{actor:{role:string};environment:string}>('/me')});
 const [sku,setSku]=useState('SKU-OK-1'),[selected,setSelected]=useState('SKU-OK-1');
 const enabled=me.data?.environment!=='production'&&me.data?.actor.role==='admin';
 const result=useQuery({queryKey:['loyal-simulator',selected],queryFn:()=>api<Result>(`/loyal-simulator?sku=${encodeURIComponent(selected)}`),enabled:Boolean(enabled)});
 if(!enabled)return null;
 return <section className="panel mt-5 p-5"><h2 className="text-lg font-bold">Laboratorio de Loyal — SOLO PRUEBAS</h2>
 <Notice>Simulación sin conexión a Loyal. Ningún resultado habilita una OC real ni genera un CSV oficial.</Notice>
 <div className="mt-4 flex flex-wrap gap-2"><select className="field max-w-sm" aria-label="Caso simulado Loyal" value={sku} onChange={e=>setSku(e.target.value)}>
 {['SKU-OK-1','SKU-PENDING-2','SKU-REJECTED-3','SKU-MISSING-4','SKU-UNKNOWN'].map(s=><option key={s}>{s}</option>)}</select>
 <button className="btn-secondary" onClick={()=>setSelected(sku)}>Probar estado</button></div>
 {result.data&&<p className="mt-3 text-sm">Código <b>{result.data.sku}</b>: <b>{result.data.status}</b> · {result.data.stage} · No autoriza exportación.</p>}
 {result.isError&&<p className="mt-3 text-sm text-red-700">No se pudo ejecutar la simulación: {String(result.error)}</p>}
 </section>;
}
