#!/bin/bash

# Script de comandos útiles para el proyecto

echo "🚀 Factura Scanner - Comandos Útiles"
echo "=================================="

case "$1" in
    "install")
        echo "📦 Instalando dependencias..."
        uv sync
        ;;
    "build")
        echo "🏗️  Construyendo contenedores Docker..."
        docker-compose build
        ;;
    "up")
        echo "▶️  Levantando servicios completos..."
        docker-compose up --build
        ;;
    "ocr-only")
        echo "🔍 Levantando solo servicio OCR..."
        docker-compose up --build ocr-service
        ;;
    "dev")
        echo "🛠️  Modo desarrollo (sin Docker)..."
        echo "⚠️  Asegúrate de tener Tesseract instalado o el servicio OCR corriendo"
        uv run fastapi dev main_ocr.py --host 0.0.0.0 --port 8000
        ;;
    "test")
        echo "🧪 Probando imagen local..."
        uv run python main_ocr.py
        ;;
    "logs")
        echo "📋 Mostrando logs..."
        docker-compose logs -f
        ;;
    "stop")
        echo "⏹️  Deteniendo servicios..."
        docker-compose down
        ;;
    "clean")
        echo "🧹 Limpiando contenedores..."
        docker-compose down --volumes --remove-orphans
        docker system prune -f
        ;;
    *)
        echo "Comandos disponibles:"
        echo "  ./run.sh install     - Instalar dependencias"
        echo "  ./run.sh build       - Construir contenedores"
        echo "  ./run.sh up          - Levantar servicios completos"
        echo "  ./run.sh ocr-only    - Solo servicio OCR"
        echo "  ./run.sh dev         - Modo desarrollo"
        echo "  ./run.sh test        - Probar imagen local"
        echo "  ./run.sh logs        - Ver logs"
        echo "  ./run.sh stop        - Detener servicios"
        echo "  ./run.sh clean       - Limpiar todo"
        ;;
esac
