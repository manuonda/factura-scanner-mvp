from typing import Annotated
from fastapi import FastAPI, File, UploadFile, HTTPException

from services.ProcesadorFactura import ProcesadorFactura
import os
import asyncio

app = FastAPI(
    title="Scanner API",
    description="API para escanear facturas y extraer datos"
)


procesadorFactura = ProcesadorFactura()

@app.post("/files")
async def create_file(file:Annotated[bytes, File()]):
    return {"file_size": len(file)}


@app.post("/upload")
async def upload_invoice(file: UploadFile= File(...)):
    """ Subir y procesar el archivo subido"""
    if  file and not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")

    
    allowed_extensions=[".jpg",".jpeg",".png",".pdf"]
    file_extension= os.path.splitext(file.filename)[1].lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Extension no permitida . Use: {allowed_extensions}"
        )
        
if __name__ == "__main__":
    image_ruth =  os.path.abspath("images/mercado_pago.jpeg")
    print(f"Ruta de imagen: {image_ruth}")
    image_bytes = None
    with open(image_ruth, "rb") as f:
        image_bytes = f.read()
    resultado = asyncio.run(procesadorFactura.procesar_archivo(image_bytes, "mercado_pago.jpeg"))
    print(f"Resultado: {resultado}")
 
   
    



    