import {csvEscape, type CsvMapping, type Line, type Order} from '@workforce/domain';

/** Borrador automatico, NO exportable al ERP: tolera campos pendientes, no aprobaciones. */
const fallbackColumns: CsvMapping['columns'] = [
 {column:'Orden',source:'orderNumber'}, {column:'Cliente',source:'client'},
 {column:'Codigo',source:'sku'}, {column:'Descripcion',source:'description'},
 {column:'Cantidad',source:'quantity'}, {column:'Unidad',source:'unit'},
 {column:'Precio',source:'unitPrice'}, {column:'Moneda',source:'currency'},
 {column:'Fecha',source:'issuedAt'}, {column:'Lista',source:'priceListCode'}
];
export type DraftResult = {content:string;officialMapping:boolean;missing:string[];columns:string[];rows:string[][]};
export function buildDraftCsv(order:Order,lines:Line[],mapping:CsvMapping|null):DraftResult {
 const officialMapping=Boolean(mapping?.validated && mapping.columns?.length);
 const columns=officialMapping?mapping!.columns:fallbackColumns;
 const delimiter=officialMapping?mapping!.delimiter:';';
 const missing:string[]=[];
 const value=(line:Line,source:CsvMapping['columns'][number]['source']):string|number|null|undefined=>{
   if(source==='orderNumber')return order.orderNumber;
   if(source==='client')return order.client;
   if(source==='issuedAt')return order.issuedAt;
   if(source==='priceListCode')return order.priceListCode;
   return line[source];
 };
 const rows=[columns.map(c=>csvEscape(c.column,delimiter)).join(delimiter)];
 const displayRows:string[][]=[];
 for(const [index,line] of lines.entries()){
  const displayValues:string[]=[];
  rows.push(columns.map(c=>{
   const v=value(line,c.source);
   if(v===null||v===undefined||String(v).trim()==='')missing.push(`Linea ${index+1}: ${c.column}`);
   displayValues.push(v===null||v===undefined?'':String(v));
   return csvEscape(v,delimiter);
  }).join(delimiter));
  displayRows.push(displayValues);
 }
 return {content:'\ufeff'+rows.join('\r\n')+'\r\n',officialMapping,missing,columns:columns.map(c=>c.column),rows:displayRows};
}
