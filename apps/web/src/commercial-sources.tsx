import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {PageHeader} from './components';
type Source={id:string;filename:string;kind:string;sheetName:string;headers:string[];rowCount:number};
type DataRow={rowNumber:number;values:string[]};
export function CommercialSources(){
 const [selected,setSelected]=useState(''),[page,setPage]=useState(0);
 const sources=useQuery({queryKey:['commercial-sources'],queryFn:()=>api<Source[]>('/commercial-sources')});
 const source=sources.data?.find(s=>s.id===selected);
 const rows=useQuery({queryKey:['commercial-source-rows',selected,page],queryFn:()=>api<DataRow[]>(`/commercial-sources/${selected}/rows?limit=100&offset=${page*100}`),enabled:!!selected});
 return <><PageHeader title="Fuentes comerciales" subtitle="Datos originales de los archivos recibidos. No se importan como órdenes aprobadas."/>
 <div className="panel p-5"><label className="label" htmlFor="commercial-source">Archivo y hoja</label>
 {sources.isError&&<p role="alert">Error consultando las fuentes: {String(sources.error)}</p>}
 <select id="commercial-source" className="field max-w-3xl" value={selected} onChange={e=>{setSelected(e.target.value);setPage(0)}}><option value="">Seleccionar fuente...</option>{sources.data?.map(s=><option key={s.id} value={s.id}>{s.filename} · {s.sheetName} ({s.rowCount} filas)</option>)}</select>
 {sources.isSuccess&&sources.data?.length===0&&<p className="mt-3 text-sm">Todavía no se importaron archivos comerciales a D1.</p>}
 {source&&<div className="mt-5"><p className="mb-3 text-sm text-slate-600">{source.filename} · {source.rowCount} registros · Solo consulta</p>
 {rows.isError&&<p role="alert">Error cargando filas: {String(rows.error)}</p>}
 <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-100"><tr><th className="th">Fila</th>{source.headers.map((h,i)=><th className="th" key={i}>{h||`Columna ${i+1}`}</th>)}</tr></thead><tbody>{rows.data?.map(r=><tr key={r.rowNumber}><td className="td">{r.rowNumber}</td>{source.headers.map((_,i)=><td className="td" key={i}>{r.values[i]||'—'}</td>)}</tr>)}</tbody></table></div>
 <div className="mt-4 flex gap-3"><button className="btn-secondary" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><span className="pt-2 text-sm">Página {page+1}</span><button className="btn-secondary" disabled={(page+1)*100>=source.rowCount} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div>
 </div>}</div></>;
}
