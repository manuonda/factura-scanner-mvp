from typing import Annotated
from fastapi import FastAPI, File, UploadFile, HTTPException

from services.ProcesadorFacturaTesseract import ProcesadorFacturaTesseract
import os
import asyncio

app = FastAPI(
    title="Scanner API - Tesseract Version",
    description="API para escanear facturas y extraer datos usando Tesseract OCR"
)


procesadorFactura = ProcesadorFacturaTesseract()

@app.post("/files")
async def create_file(file:Annotated[bytes, File()]):
    return {"file_size": len(file)}


@app.post("/upload")
async def upload_invoice(file: UploadFile = File(...)):
    """ Subir y procesar el archivo subido con Tesseract OCR"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")

    
    allowed_extensions=[".jpg",".jpeg",".png",".pdf"]
    file_extension= os.path.splitext(file.filename)[1].lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Extension no permitida . Use: {allowed_extensions}"
        )
    
    try:
        # Leer contenido del archivo
        file_content = await file.read()
        
        # Procesar con Tesseract
        resultado = await procesadorFactura.procesar_archivo(file_content, file.filename)
        
        return resultado
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar archivo: {str(e)}"
        )
        
if __name__ == "__main__":
    image_path = os.path.abspath("images/mercado_pago.jpeg")
    print(f"Ruta de imagen: {image_path}")
    
    try:
        with open(image_path, "rb") as f:
            image_bytes = f.read()
        
        resultado = asyncio.run(procesadorFactura.procesar_archivo(image_bytes, "mercado_pago.jpeg"))
        print(f"Resultado: {resultado}")
        
    except FileNotFoundError:
        print(f"Archivo no encontrado: {image_path}")
    except Exception as e:
        print(f"Error: {e}")
