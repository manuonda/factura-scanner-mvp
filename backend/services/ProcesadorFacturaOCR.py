import os
import httpx
from typing import Dict, Optional
from datetime import datetime


class ProcesadorFacturaOCR:
    """Cliente para el servicio OCR en Docker"""

    def __init__(self, ocr_service_url: str = "http://ocr-service:8001"):
        """ Inicializa el cliente del servicio OCR """
        self.ocr_service_url = ocr_service_url
        print(f"Inicializando ProcesadorFacturaOCR con URL: {ocr_service_url}")
          
    async def procesar_archivo(self, file_content: bytes, filename: str) -> Dict:
        """ Procesa el archivo usando el servicio OCR remoto """
        
        try:
            print(f"Procesando archivo: {filename} usando servicio OCR")
            
            # Crear el payload para el servicio OCR
            files = {"file": (filename, file_content, "image/jpeg")}
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Llamar al servicio OCR
                response = await client.post(
                    f"{self.ocr_service_url}/process-invoice", 
                    files=files
                )
                
                if response.status_code != 200:
                    raise Exception(f"Error en servicio OCR: {response.status_code} - {response.text}")
                
                result = response.json()
                
                # Agregar timestamp
                result["timestamp"] = datetime.now().isoformat()
                
                return result
            
        except httpx.ConnectError:
            raise Exception("No se puede conectar al servicio OCR. Asegúrate de que el servicio esté ejecutándose.")
        except httpx.TimeoutException:
            raise Exception("Timeout al procesar la imagen. El archivo puede ser muy grande.")
        except Exception as e:
            print(f"Error al procesar factura {filename}: {str(e)}")
            raise Exception(f"Error al procesar factura {filename}: {str(e)}")
    
    async def extraer_texto_solamente(self, file_content: bytes, filename: str) -> str:
        """ Extrae solo el texto sin parsing adicional """
        
        try:
            files = {"file": (filename, file_content, "image/jpeg")}
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.ocr_service_url}/extract-text", 
                    files=files
                )
                
                if response.status_code != 200:
                    raise Exception(f"Error en servicio OCR: {response.status_code}")
                
                result = response.json()
                return result.get("extracted_text", "")
                
        except Exception as e:
            raise Exception(f"Error al extraer texto: {str(e)}")
    
    async def health_check(self) -> Dict:
        """ Verifica si el servicio OCR está funcionando """
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self.ocr_service_url}/health")
                
                if response.status_code == 200:
                    return response.json()
                else:
                    return {"status": "unhealthy", "error": f"HTTP {response.status_code}"}
                    
        except Exception as e:
            return {"status": "unhealthy", "error": str(e)}
