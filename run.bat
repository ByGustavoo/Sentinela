@echo off
title Sentinela
cd /d "%~dp0"

rem --- o ARP exige privilegios de administrador ---
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [!] O Sentinela precisa ser executado COMO ADMINISTRADOR.
    echo      Clique com o botao direito neste run.bat e escolha
    echo      "Executar como administrador".
    echo.
    pause
    exit /b
)

echo.
echo   Sentinela  --  http://127.0.0.1:5000
echo   (feche esta janela ou pressione Ctrl+C para encerrar; os bloqueios sao desfeitos)
echo.

python app.py

echo.
echo   Sentinela encerrado. Todos os bloqueios foram desfeitos.
pause
