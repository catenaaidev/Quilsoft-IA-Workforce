import {spawnSync} from 'node:child_process';
// The platform's connected Cloudflare Build can override a different Worker name.
if (process.env.CI || process.env.CF_BUILD_ID || process.env.WORKERS_CI) {
  throw new Error('No desplegar OC desde el CI de la plataforma. Crear un proyecto independiente con raíz integrations/oc-m365-supabase.');
}
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['wrangler', 'deploy', '--config', 'integrations/oc-m365-supabase/wrangler.jsonc'], {stdio:'inherit', shell:process.platform === 'win32'});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
