"""Static checks; no network or production connection required."""
from __future__ import annotations
import json, pathlib, sys, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
required=['package.json','apps/api/src/index.ts','apps/api/src/app.ts','apps/api/wrangler.jsonc',
'apps/web/src/main.tsx','apps/web/src/pages.tsx','packages/domain/src/index.ts',
'infra/supabase/migrations/20261117160000_workforce_init.sql',
'services/document-processor/app/main.py','docs/README.md','docs/SECURITY.md','docs/TEST_RESULTS.md']
errors=[]
def source_files():
 for path in root.rglob('*'):
  if path.is_file() and not any(part in {'node_modules','.git','.wrangler','.deploy-check','dist','__pycache__','.pytest_cache'} for part in path.relative_to(root).parts):
   yield path
for rel in required:
 if not (root/rel).is_file(): errors.append('MISSING '+rel)
for path in (p for p in source_files() if p.suffix == '.json'):
 try:json.loads(path.read_text())
 except Exception as exc:errors.append(f'JSON {path.relative_to(root)}: {exc}')
try:
 p=root/'apps/api/wrangler.jsonc'
 json.loads(p.read_text())
except Exception as exc:errors.append(f'WRANGLER JSONC: {exc}')
secrets=['-----BEGIN PRIVATE KEY-----','sk_test_','eyJhbGciOiJSUzI1NiIs']
for path in source_files():
 if path.name == 'verify_package.py': continue
 if not path.is_file() or path.suffix not in ('.ts','.tsx','.py','.json','.sql','.md','.txt','.example','.yaml'):
  continue
 data=path.read_text(errors='replace')
 for secret in secrets:
  if secret in data:errors.append(f'Possible secret {path.relative_to(root)}')
print(json.dumps({'files':sum(1 for p in source_files()),'checked':len(required),'errors':errors},ensure_ascii=False,indent=2))
sys.exit(bool(errors))
