import {useQuery} from '@tanstack/react-query';
import {api} from './api';
import {Download} from 'lucide-react';
type Draft={source:string;columns:string[];rows:string[][];missing:string[];officialMapping:boolean};
export function CsvDraftPreview({orderId}:{orderId:string}){
 const q=useQuery({queryKey:['csv-preview',orderId],queryFn:()=>api<Draft>(`/orders/${orderId}/csv-draft?preview=1`),retry:false,refetchInterval:15000});
 return <section className="panel overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b p-5"><div><h2 className="text-lg font-bold">Vista previa de CSV · revisión humana</h2><p className="mt-1 text-sm text-slate-600">Así quedarán los campos extraídos. Los vacíos deben verificarse antes de generar el archivo definitivo.</p></div>{q.data&&<a href={`/api/orders/${orderId}/csv-draft`} className="btn-secondary"><Download size={16}/> Descargar borrador</a>}</div>
 {q.isLoading?<p className="p-5 text-sm text-slate-500">Preparando vista previa…</p>:q.isError?<p className="p-5 text-sm text-amber-800">Todavía no hay líneas extraídas o el formato está pendiente de verificar.</p>:q.data&&<><div className="px-5 py-3 text-sm text-amber-900 bg-amber-50">{q.data.officialMapping?'Columnas según mapeo marcado como validado en la aplicación.':'Formato preliminar: falta validar el mapeo oficial de Worknet.'} Nunca importar este borrador al ERP.</div>
 <div className="max-h-[440px] overflow-auto"><table className="w-full min-w-max border-collapse"><thead className="sticky top-0 bg-slate-50"><tr>{q.data.columns.map((c,i)=><th className="th whitespace-nowrap" key={i}>{c}</th>)}</tr></thead><tbody>{q.data.rows.map((line,i)=><tr key={i} className="hover:bg-teal-50">{line.map((value,j)=><td key={j} className={`td whitespace-nowrap ${!value?'bg-amber-50 text-amber-700':''}`}>{value||'Pendiente'}</td>)}</tr>)}</tbody></table></div>
 {q.data.missing.length>0&&<details className="border-t px-5 py-4 text-sm"><summary className="cursor-pointer font-semibold text-amber-900">{q.data.missing.length} campos sin completar</summary><ul className="mt-2 list-inside list-disc text-slate-700">{q.data.missing.slice(0,40).map((v,i)=><li key={i}>{v}</li>)}</ul></details>}
 </>}</section>;
}
