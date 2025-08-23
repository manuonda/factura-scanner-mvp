from fastapi import FastAPI, File, UploadFile, HTTPException
from PIL import Image
import pytesseract
import cv2
import numpy as np
import io
import re
from typing import Dict

app = FastAPI(title="Tesseract OCR Service")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        version = pytesseract.get_tesseract_version()
        return {"status": "healthy", "tesseract_version": str(version)}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Extrae texto de una imagen usando Tesseract OCR"""
    
    try:
        # Leer contenido del archivo
        file_content = await file.read()
        
        # Convertir a imagen PIL
        image = Image.open(io.BytesIO(file_content))
        
        # Mejorar imagen
        enhanced_image = enhance_image(image)
        
        # Extraer texto
        config = '--oem 3 --psm 6 -l spa+eng'
        text = pytesseract.image_to_string(enhanced_image, config=config)
        
        return {
            "success": True,
            "filename": file.filename,
            "extracted_text": text,
            "text_length": len(text)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting text: {str(e)}")

@app.post("/process-invoice")
async def process_invoice(file: UploadFile = File(...)):
    """Procesa una factura completa y extrae datos estructurados"""
    
    try:
        # Extraer texto primero
        file_content = await file.read()
        image = Image.open(io.BytesIO(file_content))
        enhanced_image = enhance_image(image)
        
        config = '--oem 3 --psm 6 -l spa+eng'
        text = pytesseract.image_to_string(enhanced_image, config=config)
        
        # Parsear datos
        parsed_data = parse_invoice_data(text)
        
        return {
            "success": True,
            "filename": file.filename,
            "extracted_text": text,
            "parsed_data": parsed_data
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing invoice: {str(e)}")

def enhance_image(image: Image.Image) -> Image.Image:
    """Mejora la imagen para mejor OCR"""
    try:
        # Convertir PIL a OpenCV
        img_array = np.array(image)
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
        
        return Image.fromarray(binary)
        
    except Exception as e:
        print(f"Error enhancing image: {str(e)}")
        return image

def parse_invoice_data(text: str) -> Dict:
    """Parsea el texto para extraer datos de factura"""
    data = {
        "date": None,
        "total": None,
        "invoice_number": None,
        "company": None,
        "items": []
    }
    
    try:
        # Buscar fecha
        date_patterns = [
            r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b',
            r'\b(\d{1,2}\s+de\s+\w+\s+de\s+\d{4})\b',
            r'\b(\d{4}-\d{1,2}-\d{1,2})\b'
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                data["date"] = match.group(1)
                break
        
        # Buscar total
        total_patterns = [
            r'total[:\s]*\$?\s*(\d+[.,]\d{2})',
            r'importe[:\s]*\$?\s*(\d+[.,]\d{2})',
            r'\$\s*(\d+[.,]\d{2})',
            r'(\d+[.,]\d{2})\s*(?:pesos|ars|$)'
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                total_str = match.group(1).replace(',', '.')
                data["total"] = float(total_str)
                break
        
        # Buscar número de factura
        invoice_patterns = [
            r'factura[:\s]*n°?\s*(\d+)',
            r'n°\s*(\d+)',
            r'número[:\s]*(\d+)'
        ]
        
        for pattern in invoice_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                data["invoice_number"] = match.group(1)
                break
        
        # Buscar empresa
        lines = text.split('\n')
        first_lines = [line.strip() for line in lines[:5] if line.strip()]
        if first_lines:
            data["company"] = first_lines[0]
        
        return data
        
    except Exception as e:
        print(f"Error parsing data: {str(e)}")
        return data

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
