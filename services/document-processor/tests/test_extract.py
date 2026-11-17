import io
import os
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from app.main import app, extract_text
from docx import Document
from openpyxl import Workbook

def test_plain_text():
    assert 'ORDEN' in extract_text('oc.txt','text/plain',b'ORDEN 22')['text']

def test_invalid_pdf():
    try: extract_text('bad.pdf','application/pdf',b'not-a-pdf')
    except ValueError as e: assert 'signature' in str(e)
    else: assert False

def test_docx():
    doc=Document();doc.add_paragraph('OC 422 Cliente Prueba');buf=io.BytesIO();doc.save(buf)
    assert 'Cliente Prueba' in extract_text('orden.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',buf.getvalue())['text']

def test_xlsx():
    book=Workbook();book.active['A1']='Código';book.active['B2']='SKU-100';buf=io.BytesIO();book.save(buf)
    assert 'SKU-100' in extract_text('orden.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buf.getvalue())['text']

def test_image_without_ocr_fail_closed():
    from PIL import Image
    buf=io.BytesIO();Image.new('RGB',(50,50),'white').save(buf,format='PNG')
    old=os.environ.pop('OCR_ENABLED',None)
    try:
        try: extract_text('a.png','image/png',buf.getvalue())
        except ValueError as e: assert 'OCR not enabled' in str(e)
        else: assert False
    finally:
        if old is not None:os.environ['OCR_ENABLED']=old

def test_api_requires_token():
    client=TestClient(app)
    assert client.post('/extract',content=b'foo',headers={'content-type':'text/plain'}).status_code==401

def test_pdf_with_text():
    from reportlab.pdfgen import canvas
    buf=io.BytesIO();pdf=canvas.Canvas(buf,pagesize=(400,300));pdf.drawString(20,200,'Orden de compra OC-100');pdf.save()
    result=extract_text('oc.pdf','application/pdf',buf.getvalue())
    assert 'OC-100' in result['text']
    assert result['pages']==1
    assert result['reviewRequired'] is True
