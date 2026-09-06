@echo off
cd /d "%~dp0"
set PORT=8000

where python >nul 2>nul
if %errorlevel%==0 (
  echo Starting local server with Python on http://localhost:%PORT%/ ...
  start "D-C server (close this window to stop)" cmd /c "python -m http.server %PORT%"
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:%PORT%/index.html"
  goto :done
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo Starting local server with Python (py launcher) on http://localhost:%PORT%/ ...
  start "D-C server (close this window to stop)" cmd /c "py -m http.server %PORT%"
  timeout /t 1 /nobreak >nul
  start "" "http://localhost:%PORT%/index.html"
  goto :done
)

where npx >nul 2>nul
if %errorlevel%==0 (
  echo Starting local server with Node (npx serve) on http://localhost:%PORT%/ ...
  start "D-C server (close this window to stop)" cmd /c "npx --yes serve -l %PORT% ."
  timeout /t 2 /nobreak >nul
  start "" "http://localhost:%PORT%/index.html"
  goto :done
)

echo Could not find Python or Node.js on this machine.
echo Install Python from https://www.python.org/downloads/ ^(check "Add python.exe to PATH" during install^)
echo or Node.js from https://nodejs.org/, then double-click this file again.
pause
goto :eof

:done
echo.
echo The game should open in your browser at http://localhost:%PORT%/index.html
echo A separate "D-C server" window is now running the local server - leave it open
echo while you play, and close it (or press Ctrl+C in it) when you're done.
pause
