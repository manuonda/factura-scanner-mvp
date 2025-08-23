import os
import re
import io
from typing import Dict, Optional, List
from datetime import datetime
import cv2
import numpy as np
from PIL import Image
import pytesseract


class ProcesadorFacturaTesseract:

    def __init__(self):
        """ Inicializa el procesador con Tesseract OCR """
        
        try:
            print(f"Inicializando ProcesadorFacturaTesseract")
            # Configurar Tesseract (ajustar path si es necesario)
            # pytesseract.pytesseract.tesseract_cmd = '/usr/bin/tesseract'
            
            # Verificar que Tesseract está instalado
            version = pytesseract.get_tesseract_version()
            print(f"Tesseract versión: {version}")
            
        except Exception as ex:
            print(f"Error al inicializar ProcesadorFacturaTesseract: {ex}")
            print("Asegúrate de tener Tesseract instalado: sudo apt install tesseract-ocr tesseract-ocr-spa")
          
    async def procesar_archivo(self, file_content: bytes, filename: str) -> Dict:
        """ Procesa el archivo subido y extrae los datos de la factura """
        
        try:
            print(f"Procesando archivo: {filename}")
            
            # Convertir bytes a imagen
            imagen = Image.open(io.BytesIO(file_content))
            
            # Mejorar la imagen para mejor OCR
            imagen_mejorada = self._mejorar_imagen(imagen)
            
            # Extraer texto con Tesseract
            texto_extraido = self._extraer_texto_tesseract(imagen_mejorada)
            
            # Parsear datos de la factura
            datos_factura = self._parsear_datos_factura(texto_extraido)
            
            return {
                "success": True,
                "filename": filename,
                "texto_extraido": texto_extraido,
                "datos_extraidos": datos_factura,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"Error al procesar factura {filename}: {str(e)}")
            raise Exception(f"Error al procesar factura {filename}: {str(e)}")
    
    def _mejorar_imagen(self, imagen: Image.Image) -> Image.Image:
        """ Mejora la imagen para mejor reconocimiento OCR """
        
        try:
            # Convertir PIL a OpenCV
            img_array = np.array(imagen)
            if len(img_array.shape) == 3:
                img_cv = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
            else:
                img_cv = img_array
            
            # Convertir a escala de grises
            if len(img_cv.shape) == 3:
                gray = cv2.cvtColor(img_cv, cv2.COLOR_BGR2GRAY)
            else:
                gray = img_cv
            
            # Aplicar filtro de ruido
            denoised = cv2.medianBlur(gray, 3)
            
            # Mejorar contraste
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(denoised)
            
            # Binarización adaptativa
            binary = cv2.adaptiveThreshold(
                enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 11, 2
            )
            
            # Convertir de vuelta a PIL
            imagen_mejorada = Image.fromarray(binary)
            
            return imagen_mejorada
            
        except Exception as e:
            print(f"Error al mejorar imagen: {str(e)}")
            # Si falla el procesamiento, devolver imagen original
            return imagen
    
    def _extraer_texto_tesseract(self, imagen: Image.Image) -> str:
        """ Extrae texto usando Tesseract OCR """
        
        try:
            # Configuración de Tesseract para español y inglés
            config = '--oem 3 --psm 6 -l spa+eng'
            
            # Extraer texto
            texto = pytesseract.image_to_string(imagen, config=config)
            
            print(f"Texto extraído: {texto[:200]}...")  # Primeros 200 caracteres
            return texto
            
        except Exception as e:
            print(f"Error en extracción de texto: {str(e)}")
            raise Exception(f"Error en extracción de texto: {str(e)}")
    
    def _parsear_datos_factura(self, texto: str) -> Dict:
        """ Parsea el texto extraído para obtener datos estructurados de la factura """
        
        datos = {
            "fecha": None,
            "total": None,
            "numero_factura": None,
            "empresa": None,
            "items": []
        }
        
        try:
            # Buscar fecha (varios formatos)
            fecha_patterns = [
                r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b',
                r'\b(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})\b',
                r'\b(\d{4}-\d{1,2}-\d{1,2})\b'
            ]
            
            for pattern in fecha_patterns:
                match = re.search(pattern, texto, re.IGNORECASE)
                if match:
                    datos["fecha"] = match.group(1)
                    break
            
            # Buscar total (varios formatos)
            total_patterns = [
                r'total[:\s]*\$?\s*(\d+[.,]\d{2})',
                r'importe[:\s]*\$?\s*(\d+[.,]\d{2})',
                r'\$\s*(\d+[.,]\d{2})',
                r'(\d+[.,]\d{2})\s*(?:pesos|ars|$)'
            ]
            
            for pattern in total_patterns:
                match = re.search(pattern, texto, re.IGNORECASE)
                if match:
                    # Normalizar formato decimal
                    total_str = match.group(1).replace(',', '.')
                    datos["total"] = float(total_str)
                    break
            
            # Buscar número de factura
            factura_patterns = [
                r'factura[:\s]*n°?\s*(\d+)',
                r'n°\s*(\d+)',
                r'número[:\s]*(\d+)'
            ]
            
            for pattern in factura_patterns:
                match = re.search(pattern, texto, re.IGNORECASE)
                if match:
                    datos["numero_factura"] = match.group(1)
                    break
            
            # Buscar empresa (primeras líneas del texto)
            lineas = texto.split('\n')
            primeras_lineas = [linea.strip() for linea in lineas[:5] if linea.strip()]
            if primeras_lineas:
                # La empresa suele estar en las primeras líneas
                datos["empresa"] = primeras_lineas[0]
            
            print(f"Datos parseados: {datos}")
            return datos
            
        except Exception as e:
            print(f"Error al parsear datos: {str(e)}")
            return datos
