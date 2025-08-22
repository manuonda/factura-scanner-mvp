import os 
import re 
import io 
from typing import Dict, Optional, List, Any
from datetime import datetime
from google.cloud import vision


class ProcesadoraFactura:

    def __init__(self):
        """ Inicializa el cliente de Vision de API
            Requiere que GOOGLE_APPLICATION_CREDENTIALS este 
            configurado 
        """
        
        try:
          print(f"Inicializando ProcesadorFactura")
          self.client = vision.ImageAnnotatorClient()  
        except Exception as ex:
          print(f"Error al inicializar ProcesadorFactura : {ex}")
          
    async def procesar_archivo(self, file_content: bytes, filename: str ) -> Dict:
        
        """ Procesa el archivo subido y extrae los datos de la factura """
        
        try:
            imagen_mejorada = 