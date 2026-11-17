import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AlertTriangle,CheckCircle2,LoaderCircle } from 'lucide-react';
import type { OrderStatus } from './api';
import { statusLabels } from './api';
export function Status({value}:{value:OrderStatus}){return <span className={`status s-${value}`}>{statusLabels[value]}</span>}
export function Loading(){return <div className="flex items-center gap-2 p-8 text-slate-500"><LoaderCircle size={20} className="animate-spin"/>Cargando información…</div>}
export function Notice({children,kind='info'}:{children:ReactNode;kind?:'info'|'error'|'success'}){return <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${kind==='error'?'border-red-200 bg-red-50 text-red-800':kind==='success'?'border-green-200 bg-green-50 text-green-800':'border-sky-200 bg-sky-50 text-sky-800'}`}>{kind==='error'?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<div>{children}</div></div>}
export function PageHeader({title,subtitle,action}:{title:string;subtitle?:string;action?:ReactNode}){return <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>{subtitle&&<p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>{action}</div>}
export function Empty({message}:{message:string}){return <div className="p-12 text-center text-sm text-slate-500">{message}</div>}
export function OrderLink({id,number}:{id:string;number?:string|null}){return <Link className="font-semibold text-brand-600 hover:underline" to={`/ordenes/${id}`}>{number||'Sin identificar'}</Link>}
