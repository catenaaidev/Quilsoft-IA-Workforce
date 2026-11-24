import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type Props = { title: string; subtitle?: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean };

/** Edición contextual: evita enviar al usuario al final de tablas extensas. */
export function EditorDrawer({ title, subtitle, children, onClose, busy = false, wide = false }: Props) {
 const headingId = useId();
 const closeRef = useRef(onClose);
 const busyRef = useRef(busy);
 closeRef.current = onClose;
 busyRef.current = busy;
 const panel = useRef<HTMLElement>(null);
 useEffect(() => {
  const lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  const focusFirst = window.requestAnimationFrame(() => {
   (panel.current?.querySelector('input:not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled)') as HTMLElement | null)?.focus();
  });
  const onKeyDown = (event: KeyboardEvent) => {
   if (event.key === 'Escape' && !busyRef.current) { event.preventDefault(); closeRef.current(); }
   if (event.key === 'Tab' && panel.current) {
    const controls = Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'));
    const first = controls[0], last = controls[controls.length - 1];
    if (first && last && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (first && last && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
   }
  };
  document.addEventListener('keydown', onKeyDown);
  return () => { window.cancelAnimationFrame(focusFirst); document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); lastFocus?.focus(); };
 }, []);
 return createPortal(
  <div className="fixed inset-0 z-[100] flex justify-end" role="presentation">
   <div className="absolute inset-0 bg-slate-900/50" aria-hidden="true" onClick={() => { if (!busy) onClose(); }} />
   <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={headingId} className={`relative z-10 flex h-full w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} flex-col bg-white shadow-2xl`}>
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-5 sm:px-7">
     <div className="min-w-0"><h2 id={headingId} className="text-xl font-bold text-slate-900">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div>
     <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700" aria-label="Cerrar panel" title="Cerrar" disabled={busy} onClick={onClose}><X size={20}/></button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">{children}</div>
   </section>
  </div>, document.body);
}
