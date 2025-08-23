import os
import re
import io
from typing import Dict, Optional, List
from datetime import datetime
from google.cloud import vision
import cv2
import numpy as np
from PIL import Image


class ProcesadorFactura:

    def __init__(self):
        """ Inicializa el cliente de Vision de API
            Requiere que GOOGLE_APPLICATION_CREDENTIALS este 
            configurado 
        """
        
        try:
          os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "./facturacion-ocr.json"
          print(f"GOOGLE_APPLICATION_CREDENTIALS: {os.environ['GOOGLE_APPLICATION_CREDENTIALS']}")
          # Inicializar el cliente de Vision API
          print(f"Inicializando ProcesadorFactura")
          self.client = vision.ImageAnnotatorClient()  
        except Exception as ex:
          print(f"Error al inicializar ProcesadorFactura : {ex}")
          
    async def procesar_archivo(self, file_content: bytes, filename: str ) -> Dict:
        
        """ Procesa el archivo subido y extrae los datos de la factura """
        
        try:
         # Preprocesar la imagen para mejorar la calidad del OCR
         imagen_mejorada = self._preprocesar_imagen(file_content)
         
         # Extraer texto usando Google Vision API
         texto_extraido = self._extraer_texto_vision(imagen_mejorada)
         
         print(f"texto_extraido : {texto_extraido}")
         return texto_extraido;
            
        except Exception as e:
            raise Exception(f"Error al procesar factura {filename}: {str(e)}")



    def _extraer_texto_vision(self, image_content: bytes) -> str:
        """
        Extrae texto usando Google Vision API.
        """
        try:
            image = vision.Image(content=image_content)
            response = self.client.text_detection(image=image)
            
            if response.error.message:
                raise Exception(f"Error de Vision API: {response.error.message}")
            
            texts = response.text_annotations
            if texts:
                return texts[0].description
            else:
                return ""
                
        except Exception as e:
            raise Exception(f"Error en extracción de texto: {str(e)}")

    
    def _preprocesar_imagen(self, file_content: bytes) -> bytes:
        """
        Mejora la calidad de la imagen para mejor OCR.
        """
        try:
            # Convertir bytes a imagen numpy
            nparr = np.frombuffer(file_content, np.uint8)
            imagen = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if imagen is None:
                return file_content  # Si no se puede procesar, devolver original
            
            # Convertir a escala de grises
            gris = cv2.cvtColor(imagen, cv2.COLOR_BGR2GRAY)
            
            # Corregir inclinación (deskew) - implementación básica
            coords = np.column_stack(np.where(gris > 0))
            if len(coords) > 0:
                angle = cv2.minAreaRect(coords)[-1]
                if angle < -45:
                    angle = -(90 + angle)
                else:
                    angle = -angle
                
                # Rotar solo si la inclinación es significativa
                if abs(angle) > 1:
                    (h, w) = imagen.shape[:2]
                    center = (w // 2, h // 2)
                    M = cv2.getRotationMatrix2D(center, angle, 1.0)
                    gris = cv2.warpAffine(gris, M, (w, h), flags=cv2.INTER_CUBIC)
            
            # Mejorar contraste usando CLAHE
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            gris = clahe.apply(gris)
            
            # Reducir ruido
            gris = cv2.medianBlur(gris, 3)
            
            # Convertir de vuelta a bytes
            _, buffer = cv2.imencode('.png', gris)
            return buffer.tobytes()
            
        except Exception:
            # Si hay error en el preprocesamiento, devolver imagen original
            return file_content