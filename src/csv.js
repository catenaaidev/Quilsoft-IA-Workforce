export const HEADERS=['OC','Fecha PI','Fecha PO','Fecha Req. Carga','Cod. Cliente','Destino','Cod. Condicion','Cod. Lista de Precio','Desc. A Nivel Pedido (S / N) ?','','Codigo de producto','Deposito (VF / Junin) = Cod. Deposito Detalle','Cantidad de cajas','Precio unit(USD)','% Desc.','Cantidad de Pallet','Contenedor','Tipo de Pallet','Incoterm','Cajas x Pallet','Observaciones','Observaciones Ampliada'];
export function csvRows(source){
 const s=source.replace(/^\uFEFF/,''),rows=[];let quoted=false,cell='',row=[];
 for(let i=0;i<s.length;i++){
  const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
  else if(c===';'&&!quoted){row.push(cell);cell=''}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x!==''))rows.push(row);row=[];cell=''}
  else cell+=c;
 }
 if(quoted)throw Error('CSV: comillas sin cerrar');if(cell||row.length){row.push(cell);rows.push(row)}
 if(!rows.length||rows[0].length!==22||rows[0].some((x,i)=>x!==HEADERS[i]))throw Error('Los encabezados no coinciden con las 22 columnas de Worknet');
 if(rows.slice(1).some(r=>r.length!==22))throw Error('Hay líneas que no tienen 22 columnas');
 return rows.slice(1);
}
export function csvText(rows){const q=v=>{v=String(v??'');return /[;"\n\r]/.test(v)?'"'+v.replaceAll('"','""')+'"':v};return [HEADERS,...rows].map(r=>r.map(q).join(';')).join('\r\n')+'\r\n'}
export function checkRow(r){const errors=[];for(const i of [0,4,7,10,12])if(!r[i])errors.push(`Falta ${HEADERS[i]}`);for(const i of [12,13,14])if(r[i]&&!/^\d+(,\d+)?$/.test(r[i]))errors.push(`Formato numérico inválido en ${HEADERS[i]}`);return errors}
