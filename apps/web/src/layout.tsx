import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, Bot, ClipboardList, FileText, LayoutDashboard, Settings2, ShieldCheck, PlugZap, Menu, X, ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { api,Actor } from './api';
import { Loading,Notice } from './components';
const CENTRAL_PORTAL='https://besa-identidad-central.besa-junin.workers.dev/';
const nav=[
 {to:'/',name:'Dashboard',icon:LayoutDashboard},
 {to:'/ordenes',name:'Órdenes de compra',icon:ClipboardList},
 {to:'/documentos',name:'Documentos',icon:FileText},
 {to:'/fuentes-comerciales',name:'Fuentes comerciales',icon:FileText},
 {to:'/maestro-productos',name:'Maestro de productos',icon:PackageSearch},
 {to:'/listas-precios',name:'Listas de precios',icon:ClipboardList},
 {to:'/agentes',name:'Agentes de IA',icon:Bot},
 {to:'/ejecuciones',name:'Ejecuciones',icon:Activity},
 {to:'/integraciones',name:'Integraciones',icon:PlugZap},
 {to:'/auditoria',name:'Auditoría',icon:ShieldCheck},
 {to:'/configuracion',name:'Configuración',icon:Settings2}
];
export function Layout(){
 const [open,setOpen]=useState(false),loc=useLocation();
 const who=useQuery({queryKey:['me'],queryFn:()=>api<{actor:Actor;environment:string}>('/me'),retry:false,staleTime:60000});
 const aside=<><div className="border-b border-white/10 px-6 py-7"><div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 text-teal-200"><Bot size={24}/></div><div className="text-xs font-bold uppercase tracking-[.18em] text-teal-300">Catena Zapata</div><div className="mt-1 text-xl font-bold text-white">EXPO AI Agent</div><div className="mt-1 text-xs text-slate-400">Plataforma de agentes empresariales</div></div><nav className="flex-1 px-3 py-5" aria-label="Navegación principal">{nav.map(item=><NavLink onClick={()=>setOpen(false)} key={item.to} end={item.to==='/'} to={item.to} className={({isActive})=>`mb-1 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition ${isActive?'bg-teal-500/15 text-white':'text-slate-300 hover:bg-white/10 hover:text-white'}`}><item.icon size={18}/>{item.name}</NavLink>)}</nav><div className="border-t border-white/10 p-5 text-xs text-slate-400">Bodegas Esmeralda · Acceso centralizado<br/>Solo usuarios autorizados</div></>;
 return <div className="min-h-screen bg-slate-50 lg:flex"><aside className="hidden min-h-screen w-64 shrink-0 flex-col bg-[#0c1b24] lg:flex">{aside}</aside>{open&&<div className="fixed inset-0 z-50 flex lg:hidden"><div className="absolute inset-0 bg-black/50" onClick={()=>setOpen(false)}/><aside className="relative flex w-64 flex-col bg-[#0c1b24]"><button className="absolute right-3 top-3 text-white" onClick={()=>setOpen(false)} aria-label="Cerrar menú"><X size={20}/></button>{aside}</aside></div>}<div className="min-w-0 flex-1"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur md:px-8"><button onClick={()=>setOpen(true)} aria-label="Abrir menú" className="text-slate-700 lg:hidden"><Menu/></button><div className="hidden text-sm text-slate-500 lg:block">EXPO AI Agent <span className="mx-2 text-slate-300">/</span> {nav.find(n=>n.to===loc.pathname)?.name||'Órdenes'}</div><div className="flex items-center gap-4"><span className="hidden text-xs text-slate-500 sm:inline">{who.data?.actor.displayName||'Acceso corporativo'}</span><a href={CENTRAL_PORTAL} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-600" title="Volver al menú BESA"><ArrowLeftRight size={17}/></a></div></header><main className="mx-auto max-w-[1500px] px-5 py-8 md:px-8">{who.isLoading?<Loading/>:who.isError?<div className="mx-auto max-w-2xl space-y-4"><h1 className="text-2xl font-bold">{nav.find(n=>n.to===loc.pathname)?.name||'EXPO AI Agent'}</h1><Notice kind="error">Necesitás iniciar sesión con el acceso central de Bodegas Esmeralda para consultar esta sección.</Notice><a href={CENTRAL_PORTAL} className="btn-primary inline-flex">Ir al acceso central BESA</a><p className="text-sm text-slate-500">Cuando tengas EXPO AI Agent asignada, abrila desde el menú de aplicaciones. La navegación funciona, pero los datos protegidos requieren una sesión válida.</p></div>:<Outlet/>}</main></div></div>;
}
