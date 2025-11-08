@echo off
echo Starting Chitchatter with local tracker...
echo.
echo This will start:
echo - Frontend on http://localhost:3000
echo - Local WebTorrent tracker on ws://localhost:8000
echo.

start "Tracker" cmd /k "npm run start:tracker"
timeout /t 2 /nobreak >nul
start "Frontend" cmd /k "set VITE_TRACKER_URL=ws://localhost:8000 && npm start"

echo.
echo Services started!
echo - Tracker: ws://localhost:8000
echo - Frontend: http://localhost:3000
echo.
echo Press any key to stop all services...
pause >nul

taskkill /FI "WINDOWTITLE eq Tracker*" /F
taskkill /FI "WINDOWTITLE eq Frontend*" /F
