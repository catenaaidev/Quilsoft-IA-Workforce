import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
const apiConfig = JSON.parse(readFileSync('apps/api/wrangler.jsonc', 'utf8'));
assert.equal(config.name, 'quilsoft-ia-workforce', 'La raíz debe desplegar la plataforma completa');
assert.equal(apiConfig.name, config.name);
assert.equal(config.main, 'apps/api/src/index.ts');
const entry = readFileSync(config.main, 'utf8');
for (const name of ['PurchaseAgent', 'PurchaseWorkflow']) {
  assert.match(entry, new RegExp('export \\{ '+name+' \\}'), `Falta exportar ${name}`);
}
assert(config.durable_objects.bindings.some(b => b.name === 'PURCHASE_AGENT' && b.class_name === 'PurchaseAgent'));
assert(config.workflows.some(b => b.binding === 'PURCHASE_WORKFLOW' && b.class_name === 'PurchaseWorkflow'));
assert(config.services.some(b => b.binding === 'IDENTITY' && b.service === 'besa-identidad-central'));
assert(config.d1_databases.some(b => b.binding === 'DB'));
assert(config.queues.producers.some(b => b.binding === 'JOBS'));
assert(config.r2_buckets.some(b => b.binding === 'DOCS'));
assert(!config.migrations.some(m => m.deleted_classes?.length), 'No eliminar clases existentes');
assert(existsSync(config.assets.directory + '/index.html'), 'Falta compilar el frontend');
const isolated = JSON.parse(readFileSync('integrations/oc-m365-supabase/wrangler.jsonc', 'utf8'));
assert.notEqual(isolated.name, config.name);
console.log('OK: plataforma completa, frontend, SSO, D1, colas, R2, Agent y Workflow; OC aislado.');
