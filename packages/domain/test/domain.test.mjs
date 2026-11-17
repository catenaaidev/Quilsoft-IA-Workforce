import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOrder, canTransition, generateCsv, csvEscape, cleanExtractedJson } from '../dist/index.js';
const order = {id:'1', orderNumber:'OC-77', client:'Cliente de prueba', issuedAt:'2026-11-17', status:'review', version:1};
const lines = [{sku:'SKU-1',description:'Producto',quantity:2,unit:'UN',unitPrice:15,currency:'ARS',technicalStatus:'approved'}];
test('orden válida solo si todas las fichas aprobadas', () => {
 assert.equal(validateOrder(order, lines).ok, true);
 for (const st of ['pending','rejected','missing','unknown']) { const v=validateOrder(order,[{...lines[0],technicalStatus:st}]); assert.equal(v.ok,false); assert.equal(v.blockers[0].status,st); }
});
test('sin documento completo no se aprueba',()=>{assert.equal(validateOrder({...order,client:null},lines).ok,false); assert.equal(validateOrder(order,[{...lines[0],quantity:0}]).ok,false);});
test('control de transiciones',()=>{assert.equal(canTransition('review','approved'),true);assert.equal(canTransition('blocked','approved'),false);assert.equal(canTransition('csv_generated','review'),false);});
test('CSV exacto con BOM, delimitador, escaping y CRLF',()=>{const csv=generateCsv(order,[{...lines[0],description:'vino; "reserva"'}],{validated:true,delimiter:';',header:true,columns:[{column:'OC',source:'orderNumber'},{column:'Desc',source:'description'}]});assert.equal(csv,'\ufeffOC;Desc\r\nOC-77;"vino; ""reserva"""\r\n');});
test('CSV sin mapeo oficial se bloquea',()=>{assert.throws(()=>generateCsv(order,lines,{validated:false,delimiter:';',header:true,columns:[]}));});
test('la salida IA JSON se parsea, no se confía ciegamente',()=>{assert.deepEqual(cleanExtractedJson('```json\n{"n":1}\n```'),{n:1});assert.throws(()=>cleanExtractedJson('ejecutar código'));});
test('escapado CSV con delimitador',()=>{assert.equal(csvEscape('a;b'), '"a;b"');});
test('bloquea inyección de fórmulas en exportación',()=>{assert.throws(()=>csvEscape('=2+2'));assert.throws(()=>csvEscape(' @evil'));assert.throws(()=>csvEscape('-SUM(1,1)'));});
import { matchesFileSignature } from '../dist/index.js';
test('rechaza archivo disfrazado de PDF',()=>{
 const bad=new TextEncoder().encode('hola').buffer;
 const good=new TextEncoder().encode('%PDF-1.4').buffer;
 assert.equal(matchesFileSignature('application/pdf',bad),false);
 assert.equal(matchesFileSignature('application/pdf',good),true);
});
