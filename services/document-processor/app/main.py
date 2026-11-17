"""Extract text only; never approve orders or execute document content."""
from __future__ import annotations
import hmac
import io
import os
import re
from urllib.parse import unquote
from fastapi import FastAPI, HTTPException, Request
from docx import Document
from openpyxl import load_workbook
from pypdf import PdfReader
from PIL import Image

MAX_BYTES = 12 * 1024 * 1024
MAX_TEXT = 100_000
MAX_PAGES = 70
app = FastAPI(title='IA Workforce - Document Processor', docs_url=None, redoc_url=None)


def extract_text(filename: str, content_type: str, data: bytes) -> dict:
    """Bounded parsing with explicit errors. Uploaded input is not trusted."""
    if not data or len(data) > MAX_BYTES:
        raise ValueError('Invalid document size')
    filename = filename[:200]
    pages = 0
    text = ''
    if content_type == 'application/pdf':
        if not data.startswith(b'%PDF-'):
            raise ValueError('PDF signature mismatch')
        reader = PdfReader(io.BytesIO(data), strict=True)
        if reader.is_encrypted:
            raise ValueError('Encrypted PDF cannot be processed')
        if len(reader.pages) > MAX_PAGES:
            raise ValueError('PDF page limit exceeded')
        pages = len(reader.pages)
        text = '\n\n'.join((page.extract_text() or '')[:15_000] for page in reader.pages)
    elif content_type == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        book = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        chunks = []
        for sheet in book.worksheets[:10]:
            chunks.append(f'SHEET {sheet.title}')
            for row in sheet.iter_rows(min_row=1, max_row=min(sheet.max_row or 0, 1000), max_col=min(sheet.max_column or 0, 60), values_only=True):
                chunks.append('\t'.join('' if v is None else str(v)[:300] for v in row))
                if sum(len(x) for x in chunks) > MAX_TEXT: break
        book.close()
        text = '\n'.join(chunks)
        pages = len(book.worksheets)
    elif content_type == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        doc = Document(io.BytesIO(data))
        text = '\n'.join(p.text for p in doc.paragraphs[:3000])
        for table in doc.tables[:50]:
            for row in table.rows[:500]:
                text += '\n' + '\t'.join(cell.text[:300] for cell in row.cells[:40])
        pages = 1
    elif content_type in ('image/png', 'image/jpeg', 'image/webp'):
        try:
            image = Image.open(io.BytesIO(data))
            image.verify()
            image = Image.open(io.BytesIO(data))
            if image.width * image.height > 25_000_000:
                raise ValueError('Image pixel limit exceeded')
        except Exception as exc:
            raise ValueError('Invalid image') from exc
        if os.environ.get('OCR_ENABLED', 'false').lower() != 'true':
            raise ValueError('OCR not enabled; image requires review')
        import pytesseract
        text = pytesseract.image_to_string(image, timeout=20)
        pages = 1
    elif content_type in ('text/plain', 'text/csv'):
        text = data.decode('utf-8-sig', errors='replace')
        pages = 1
    else:
        raise ValueError('Unsupported MIME')
    text = re.sub(r'\x00', '', text)[:MAX_TEXT]
    return {'filename': filename, 'contentType': content_type, 'pages': pages, 'text': text,
            'reviewRequired': True, 'truncated': len(text) >= MAX_TEXT}


@app.get('/health')
def health():
    return {'status': 'ok', 'service': 'document-processor'}


@app.post('/extract')
async def extract(request: Request):
    expected = os.getenv('DOC_PROCESSOR_TOKEN', '')
    authorization = request.headers.get('authorization', '')
    if not expected or not hmac.compare_digest(authorization, f'Bearer {expected}'):
        raise HTTPException(401, 'Unauthorized')
    body = await request.body()
    if len(body) > MAX_BYTES:
        raise HTTPException(413, 'Too large')
    mime = request.headers.get('content-type', '').split(';', 1)[0].strip()
    name = unquote(request.headers.get('x-filename', 'document'))
    try:
        return extract_text(name, mime, body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception:
        raise HTTPException(422, 'Document could not be read')
