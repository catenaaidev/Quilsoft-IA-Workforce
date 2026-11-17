import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { Notice } from './components';
export function DocumentPreview({documents}:{documents:any[]}){
 const [selected,setSelected]=useState('');const doc=documents.find(x=>x.id===selected)||documents[0];
 const q=useQuery({queryKey:['extraction',doc?.id],queryFn:()=>api<any>(`/documents/${doc.id}/extraction`),enabled:!!doc?.id,refetchInterval:10000});
 if(!doc)return null;
 return <div className="panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-4 border-b p-5"><h2 className="font-bold">Comparación con documento original</h2><select className="field max-w-sm" value={doc.id} onChange={e=>setSelected(e.target.value)}>{documents.map(x=><option key={x.id} value={x.id}>{x.original_filename}</option>)}</select></div><div className="grid min-h-80 md:grid-cols-2"><div className="border-r p-3">{doc.mime_type==='application/pdf'||doc.mime_type?.startsWith('image/')?<iframe key={doc.id} title="Documento original" className="h-[400px] w-full rounded-lg border" sandbox="allow-same-origin" src={`/api/documents/${doc.id}/original?preview=1`}/>:<div className="flex h-56 items-center justify-center text-center text-sm text-slate-500">Este formato no admite vista previa segura en el navegador. <a className="ml-2 text-brand-600" href={`/api/documents/${doc.id}/original`}>Descargar original</a></div>}</div><div className="p-4"><h3 className="mb-2 text-sm font-bold">Datos extraídos por el agente</h3>{q.data?.failureReason&&<Notice kind="error">{q.data.failureReason}</Notice>}<pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-100 p-3 text-xs text-slate-700">{q.data?.text||'Sin extracción disponible todavía.'}</pre><p className="mt-3 text-xs text-slate-500">El contenido extraído requiere revisión humana. No implica aprobación comercial ni técnica.</p></div></div></div>
}
