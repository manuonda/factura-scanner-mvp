from typing import Annotated
from fastapi import FastAPI, File, UploadFile, HTTPException

import os

app = FastAPI()


@app.post("/files")
async def create_file(file:Annotated[bytes, File()]):
    return {"file_size": len(file)}


@app.post("/upload")
async def upload_invoice(file: UploadFile= File(...)):
    """ Subir y procesar el archivo subido"""
    if  file and not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")

    
    allowed__extensions=[".jpg",".jpeg",".png",".pdf"]
    file_extension= os.path.splitext(file.filename)[1].lower
    if file_extension not in allowed__extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Extension no permitida . Use: {allowed__extensions}"
        )
   
    



    