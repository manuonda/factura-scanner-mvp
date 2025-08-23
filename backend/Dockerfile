# Dockerfile para FastAPI + Tesseract OCR
FROM python:3.11-slim

# Instalar Tesseract y dependencias del sistema
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-spa \
    tesseract-ocr-eng \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Configurar directorio de trabajo
WORKDIR /app

# Copiar archivo de dependencias
COPY pyproject.toml uv.lock* ./

# Instalar uv y dependencias Python
RUN pip install uv
RUN uv sync --frozen

# Copiar código fuente
COPY . .

# Exponer puerto
EXPOSE 8000

# Comando para ejecutar la aplicación
CMD ["uv", "run", "fastapi", "run", "main.py", "--host", "0.0.0.0", "--port", "8000"]
