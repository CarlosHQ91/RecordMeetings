@echo off
title MeetRecord AI - Servidor Local
echo ========================================================
echo        MEETRECORD AI - GRABADOR DE REUNIONES
echo ========================================================
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no encontrado en el sistema.
    echo Por favor instala Python 3.10+ y agregalo al PATH.
    pause
    exit /b
)

echo [1/2] Verificando dependencias...
pip install -r requirements.txt --quiet

echo.
echo [2/2] Iniciando servidor local en http://localhost:8765 ...
start http://localhost:8765
python server.py

pause
