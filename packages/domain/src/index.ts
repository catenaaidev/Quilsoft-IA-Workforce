/** Deterministic business rules. AI output cannot bypass these gates. */
export type TechnicalStatus = 'approved' | 'pending' | 'rejected' | 'missing' | 'unknown';
export type OrderStatus = 'received' | 'processing' | 'review' | 'blocked' | 'approved' | 'csv_generated' | 'completed' | 'error';
export type Line = { id?: string; sku: string; description: string; quantity: number; unit: string; unitPrice: number | null; currency: string; technicalStatus: TechnicalStatus };
export type Order = { id: string; orderNumber: string | null; client: string | null; issuedAt: string | null; priceListCode?: string | null; status: OrderStatus; version: number; lines?: Line[] };
export type Validation = { ok: boolean; errors: string[]; warnings: string[]; blockers: { sku: string; status: TechnicalStatus }[] };
export function validateOrder(order: Order, lines: Line[]): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!order.orderNumber?.trim()) errors.push('Falta el número de orden de compra');
  if (!order.client?.trim()) errors.push('Falta identificar el cliente');
  if (!lines.length) errors.push('La orden no tiene productos');
  const blockers: Validation['blockers'] = [];
  for (const [i, line] of lines.entries()) {
    const label = `Línea ${i + 1}`;
    if (!line.sku.trim()) errors.push(`${label}: falta código de producto`);
    if (!line.description.trim()) errors.push(`${label}: falta descripción`);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) errors.push(`${label}: cantidad inválida`);
    if (!line.unit.trim()) errors.push(`${label}: unidad de medida ausente`);
    if (line.unitPrice === null || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) errors.push(`${label}: precio sin validar`);
    if (!line.currency.trim()) errors.push(`${label}: moneda ausente`);
    if (line.technicalStatus !== 'approved') blockers.push({ sku: line.sku || label, status: line.technicalStatus });
  }
  if (blockers.length) errors.push('Existen fichas técnicas no confirmadas como aprobadas');
  return { ok: errors.length === 0, errors, warnings, blockers };
}
export function canTransition(current: OrderStatus, next: OrderStatus): boolean {
  const allowed: Record<OrderStatus, OrderStatus[]> = {
    received: ['processing', 'review', 'error'], processing: ['review', 'blocked', 'error'],
    review: ['blocked', 'approved', 'error'], blocked: ['review', 'error'],
    approved: ['review', 'csv_generated'], csv_generated: ['completed'], completed: [], error: ['review']
  };
  return allowed[current].includes(next);
}
export function csvEscape(value: string | number | null | undefined, delimiter = ';'): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(str)) throw new Error('CSV: valor con apariencia de fórmula; requiere revisión');
  if (/[\r\n"]/.test(str) || str.includes(delimiter)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}
export type CsvMapping = { validated: boolean; delimiter: ',' | ';' | '\t'; header: boolean; columns: Array<{ column: string; source: 'orderNumber' | 'client' | 'sku' | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'currency' | 'issuedAt' | 'priceListCode' }> };
export function generateCsv(order: Order, lines: Line[], mapping: CsvMapping): string {
  if (!mapping.validated) throw new Error('El formato CSV del ERP no fue validado');
  const validation = validateOrder(order, lines);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  if (!mapping.columns.length) throw new Error('No hay columnas de exportación configuradas');
  const getValue = (line: Line, source: CsvMapping['columns'][number]['source']) => {
    if (source === 'orderNumber') return order.orderNumber;
    if (source === 'client') return order.client;
    if (source === 'issuedAt') return order.issuedAt;
    if (source === 'priceListCode') return order.priceListCode;
    return line[source];
  };
  const rows = lines.map(line => mapping.columns.map(c => csvEscape(getValue(line, c.source), mapping.delimiter)).join(mapping.delimiter));
  if (mapping.header) rows.unshift(mapping.columns.map(c => csvEscape(c.column, mapping.delimiter)).join(mapping.delimiter));
  return '\ufeff' + rows.join('\r\n') + '\r\n';
}
export function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  return crypto.subtle.digest('SHA-256', buffer).then(bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''));
}
export function cleanExtractedJson(raw: string): unknown {
  let content = raw.trim();
  if (content.startsWith('```')) content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(content);
}
export function matchesFileSignature(mime:string, bytes:ArrayBuffer):boolean {
 const b=new Uint8Array(bytes);if(!b.length)return false;
 const starts=(arr:number[])=>arr.every((x,i)=>b[i]===x);
 switch(mime){
  case 'application/pdf':return starts([0x25,0x50,0x44,0x46,0x2d]);
  case 'image/png':return starts([0x89,0x50,0x4e,0x47]);
  case 'image/jpeg':return starts([0xff,0xd8,0xff]);
  case 'image/webp':return starts([0x52,0x49,0x46,0x46])&&b.length>=12&&String.fromCharCode(...b.slice(8,12))==='WEBP';
  case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
  case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':return starts([0x50,0x4b,0x03,0x04]);
  case 'application/vnd.ms-excel':case 'application/msword':return starts([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  case 'text/plain':case 'text/csv':return !b.slice(0,100).includes(0);
  default:return false;
 }
}

/** Tipo real del archivo por su contenido (no por el nombre ni por lo que declara el correo). */
export function sniffMime(bytes:ArrayBuffer,filename=''):string|null {
 const ext=(filename.split('.').pop()||'').toLowerCase();
 const candidatos:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',doc:'application/msword',csv:'text/csv',txt:'text/plain'};
 const porExtension=candidatos[ext];
 if(porExtension&&matchesFileSignature(porExtension,bytes))return porExtension;
 for(const m of ['application/pdf','image/png','image/jpeg','image/webp'])if(matchesFileSignature(m,bytes))return m;
 return null;
}
export * from './worknet.js';
