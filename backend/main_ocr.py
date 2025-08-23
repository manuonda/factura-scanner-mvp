from typing import Annotated
from fastapi import FastAPI, File, UploadFile, HTTPException
from services.ProcesadorFacturaOCR import ProcesadorFacturaOCR
import os
import asyncio

app = FastAPI(
    title="Scanner API - OCR Microservice Version",
    description="API para escanear facturas usando servicio OCR con Tesseract en Docker"
)

# Configurar URL del servicio OCR desde variable de entorno
OCR_SERVICE_URL = os.getenv("OCR_SERVICE_URL", "http://localhost:8001")
procesadorFactura = ProcesadorFacturaOCR(OCR_SERVICE_URL)

@app.get("/")
async def root():
    """Endpoint raíz con información del servicio"""
    return {
        "message": "Factura Scanner API - OCR Microservice",
        "ocr_service": OCR_SERVICE_URL,
        "endpoints": ["/upload", "/health", "/ocr-health"]
    }

@app.get("/health")
async def health_check():
    """Health check de la aplicación principal"""
    return {"status": "healthy", "service": "main-api"}

@app.get("/ocr-health")
async def ocr_health_check():
    """Health check del servicio OCR"""
    try:
        health = await procesadorFactura.health_check()
        return health
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/files")
async def create_file(file: Annotated[bytes, File()]):
    """Endpoint simple para verificar subida de archivos"""
    return {"file_size": len(file)}

@app.post("/upload")
async def upload_invoice(file: UploadFile = File(...)):
    """Subir y procesar factura usando servicio OCR"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")

    allowed_extensions = [".jpg", ".jpeg", ".png", ".pdf"]
    file_extension = os.path.splitext(file.filename)[1].lower()
    if file_extension not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Extensión no permitida. Use: {allowed_extensions}"
        )
    
    try:
        # Leer contenido del archivo
        file_content = await file.read()
        
        # Procesar con el servicio OCR
        resultado = await procesadorFactura.procesar_archivo(file_content, file.filename)
        
        return resultado
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar archivo: {str(e)}"
        )

@app.post("/extract-text")
async def extract_text_only(file: UploadFile = File(...)):
    """Extraer solo texto sin parsing de factura"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Archivo requerido")

    try:
        file_content = await file.read()
        texto = await procesadorFactura.extraer_texto_solamente(file_content, file.filename)
        
        return {
            "filename": file.filename,
            "extracted_text": texto,
            "text_length": len(texto)
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error al extraer texto: {str(e)}"
        )
        
if __name__ == "__main__":
    async def test_local_image():
        """Función de prueba para imagen local"""
        image_path = os.path.abspath("images/mercado_pago.jpeg")
        print(f"Ruta de imagen: {image_path}")
        
        try:
            # Verificar salud del servicio OCR
            health = await procesadorFactura.health_check()
            print(f"Estado del servicio OCR: {health}")
            
            if health.get("status") != "healthy":
                print("⚠️  El servicio OCR no está disponible. Ejecuta: docker-compose up ocr-service")
                return
            
            # Procesar imagen local
            with open(image_path, "rb") as f:
                image_bytes = f.read()
            
            resultado = await procesadorFactura.procesar_archivo(image_bytes, "mercado_pago.jpeg")
            print(f"✅ Resultado: {resultado}")
            
        except FileNotFoundError:
            print(f"❌ Archivo no encontrado: {image_path}")
        except Exception as e:
            print(f"❌ Error: {e}")
    
    # Ejecutar prueba
    asyncio.run(test_local_image())
