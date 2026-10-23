@echo off
title MeetRecord AI - Modo Inmediato Standalone
echo ========================================================
echo   MEETRECORD AI - SERVIDOR STANDALONE (CERO DEPENDENCIAS)
echo ========================================================
echo.
echo Iniciando servidor web integrado de Python en http://localhost:8765 ...
echo Puedes grabar video, capturar audio Meet + Mic y exportar todo inmediatamente.
echo.
start http://localhost:8765
python -m http.server 8765 --directory static
pause
