import {useState} from 'react';
import {HelpCircle,X} from 'lucide-react';
import {useLocation} from 'react-router-dom';
const help:Record<string,{title:string;items:string[]}>= {
 '/':{title:'Panel general',items:['Las OC entran por correo y aparecen automaticamente.','Revisá las órdenes pendientes; no tenés que cargarlas a mano.','Solo los CSV oficiales aprobados se cargan manualmente al ERP.']},
 '/ordenes':{title:'Órdenes recibidas',items:['Las órdenes provienen del buzón corporativo.','Entrá a una orden para comparar el documento y la extracción.','El borrador CSV aparece después de la lectura; no se puede importar al ERP.']},
 '/maestro-productos':{title:'Productos',items:['Buscá por código o descripción.','Editar abre un panel lateral sin perder los filtros.','Los datos oficiales de Worknet deben verificarse antes de usarse.']},
 '/listas-precios':{title:'Listas por cliente',items:['Estos registros son códigos de listas, no precios unitarios.','Editar abre un panel lateral.','En cada OC se confirma la lista aplicable.']},
 '/integraciones':{title:'Conexiones',items:['Microsoft 365 debe tener lectura limitada al buzón de OC.','Loyal real es obligatorio para aprobar.','El simulador solo está habilitado fuera de producción y nunca autoriza exportaciones.']},
 '/documentos':{title:'Documentos',items:['Los adjuntos originales se guardan en almacenamiento privado.','Si la lectura falla, hay que revisarla y registrarlo.']},
 '/agentes':{title:'Agentes',items:['Los agentes leen y proponen; no cargan órdenes en Worknet.','El estado del agente no equivale a una integración validada.']}
};
export function OperationalGuide(){const [open,setOpen]=useState(false),location=useLocation();
 const key=location.pathname.startsWith('/ordenes/')?'/ordenes':location.pathname;
 const section=help[key]||{title:'Ayuda de esta sección',items:['Usá los filtros para encontrar lo que necesitás.','Guardá los cambios antes de salir.','Consultá a IT cuando falten permisos de acceso.']};
 return <><button type="button" onClick={()=>setOpen(v=>!v)} className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-teal-700 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-teal-800" aria-label="Abrir ayuda de esta pantalla"><HelpCircle size={19}/> ¿Cómo funciona?</button>
 {open&&<div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={()=>setOpen(false)}>
  <section role="dialog" aria-modal="true" aria-label="Ayuda" className="h-full w-full max-w-sm overflow-auto bg-white p-6 shadow-2xl" onClick={e=>e.stopPropagation()}>
   <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{section.title}</h2><button aria-label="Cerrar ayuda" onClick={()=>setOpen(false)}><X/></button></div>
   <p className="mt-3 text-sm text-slate-600">Guía rápida para trabajar sin perderte.</p><ol className="mt-5 list-decimal space-y-4 pl-6 text-sm leading-relaxed text-slate-700">{section.items.map(x=><li key={x}>{x}</li>)}</ol>
  </section></div>}
 </>;
}
