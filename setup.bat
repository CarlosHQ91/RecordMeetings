@echo off
title MeetRecord AI - Instalador Automatico para Windows
echo ========================================================
echo        MEETRECORD AI - INSTALADOR PARA OTRA PC
echo ========================================================
echo.

:: 1. Verificar si Python esta instalado
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python no detectado en esta PC.
    echo [*] Intentando instalar Python 3.10 mediante Windows Package Manager (winget)...
    winget install Python.Python.3.10 --silent --accept-package-agreements --accept-source-agreements
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo instalar Python automaticamente.
        echo Por favor descarga e instala Python manualmente desde:
        echo https://www.python.org/downloads/
        echo Asegurate de marcar la casilla: "Add python.exe to PATH"
        pause
        exit /b
    )
    echo [*] Python instalado. Es posible que requieras reiniciar la terminal.
)

:: 2. Instalar dependencias necesarias
echo.
echo [*] Instalando dependencias del sistema (FastAPI, Faster-Whisper, etc.)...
python -m pip install --upgrade pip --quiet
python -m pip install -r requirements.txt --quiet

:: 3. Crear acceso directo en el Escritorio
echo.
echo [*] Creando acceso directo en tu Escritorio...
set SCRIPT_DIR=%~dp0
set SHORTCUT_PATH=%USERPROFILE%\Desktop\MeetRecord AI.bat

(
echo @echo off
echo cd /d "%SCRIPT_DIR%"
echo call start.bat
) > "%SHORTCUT_PATH%"

echo.
echo ========================================================
echo      ¡INSTALACION COMPLETADA CON EXITO!
echo ========================================================
echo Puedes iniciar MeetRecord AI desde el acceso directo creado:
echo "%SHORTCUT_PATH%"
echo.
echo O presiona cualquier tecla para iniciarlo ahora mismo...
pause >nul

call "%SCRIPT_DIR%start.bat"
