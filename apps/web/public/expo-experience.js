/* EXPO AI Agent - capa de orientacion progresiva (sin alterar APIs ni permisos). */
(() => {
  'use strict';
  if (window.__expoExperienceLoaded) return;
  window.__expoExperienceLoaded = true;

  const BRAND = 'EXPO AI Agent';
  const titlePatterns = [/Quilsoft\s*[-–—]?\s*IA\s*Workforce/gi, /IA\s*Workforce\s*[-–—]?\s*Catena\s*Zapata/gi, /\bIA\s*Workforce\b/gi];
  const skipTags = new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE','TEXTAREA','INPUT','SELECT','OPTION','SVG']);
  const changeText = (v) => titlePatterns.reduce((s, re) => s.replace(re, BRAND), v);
  const updateBrand = (root) => {
    if (document.title) document.title = changeText(document.title);
    if (!root || !document.body) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('[data-expo-assist]')) return NodeFilter.FILTER_REJECT;
        if (skipTags.has(parent.tagName) || parent.closest('code, pre, [contenteditable="true"]')) return NodeFilter.FILTER_REJECT;
        return /(?:Quilsoft\s*[-–—]?\s*)?IA\s*Workforce/i.test(node.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { node.nodeValue = changeText(node.nodeValue); });
    document.querySelectorAll('img[alt], a[title], button[title]').forEach(el => {
      for (const attr of ['alt','title']) {
        if (el.hasAttribute(attr)) el.setAttribute(attr, changeText(el.getAttribute(attr)));
      }
    });
  };

  const start = () => {
    if (!document.body) return;
    updateBrand(document.body);
    const container = document.createElement('div');
    container.setAttribute('data-expo-assist','');
    container.innerHTML = `
      <button type="button" class="expo-help-trigger" aria-label="Abrir ayuda de EXPO AI Agent" aria-haspopup="dialog" aria-expanded="false">? <span>Ayuda</span></button>
      <div class="expo-help-backdrop" hidden>
        <section class="expo-help-panel" role="dialog" aria-modal="true" aria-labelledby="expo-help-title" tabindex="-1">
          <header><div><strong id="expo-help-title">EXPO AI Agent</strong><p>Guía rápida para trabajar en la plataforma</p></div><button type="button" class="expo-help-close" aria-label="Cerrar ayuda">×</button></header>
          <div class="expo-help-content">
            <p><strong>¿Qué necesitás hacer?</strong> Elegí un módulo del menú principal:</p>
            <dl>
              <dt>Panel principal</dt><dd>Consultá el resumen de actividad y lo que requiere atención.</dd>
              <dt>Órdenes de compra</dt><dd>Ingresá y revisá órdenes; verificá sus datos antes de exportarlas.</dd>
              <dt>Documentos</dt><dd>Consultá archivos y sus estados de procesamiento.</dd>
              <dt>Maestro de productos</dt><dd>Buscá por código o descripción y verificá los datos antes de guardar.</dd>
              <dt>Agentes y ejecuciones</dt><dd>Revisá qué procesó cada agente y si necesita intervención.</dd>
              <dt>Integraciones</dt><dd>Comprobá las conexiones y sus estados reales; un estado pendiente no implica éxito.</dd>
            </dl>
            <p class="expo-help-note">Esta guía no modifica datos ni habilita permisos. Las acciones disponibles dependen de tu rol.</p>
            <p class="expo-help-shortcut">Atajo: presioná <kbd>Esc</kbd> para cerrar esta ventana.</p>
          </div>
        </section>
      </div>`;
    document.body.appendChild(container);
    const trigger = container.querySelector('.expo-help-trigger');
    const backdrop = container.querySelector('.expo-help-backdrop');
    const panel = container.querySelector('.expo-help-panel');
    const close = container.querySelector('.expo-help-close');
    let previousFocus = null;
    const hide = () => { backdrop.hidden = true; trigger.setAttribute('aria-expanded','false'); (previousFocus || trigger).focus(); };
    const show = () => { previousFocus = document.activeElement; backdrop.hidden = false; trigger.setAttribute('aria-expanded','true'); panel.focus(); };
    trigger.addEventListener('click', show);
    close.addEventListener('click', hide);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) hide(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !backdrop.hidden) { e.preventDefault(); hide(); }
      if (e.key === 'Tab' && !backdrop.hidden) {
        const elements = [...panel.querySelectorAll('button, a[href], [tabindex="0"]')];
        const first = elements[0], last = elements[elements.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    const observer = new MutationObserver(records => {
      observer.disconnect();
      for (const record of records) {
        if (record.target && !container.contains(record.target)) {
          const target = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
          if (target && target.isConnected) updateBrand(target);
        }
      }
      observer.observe(document.body, {childList:true,subtree:true,characterData:true});
    });
    observer.observe(document.body, {childList:true,subtree:true,characterData:true});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
