@echo off
cd /d "%~dp0"
if not exist server\.env (
  echo Tao server\.env tu mau...
  copy server\.env.example server\.env >nul
  echo Hay sua server\.env de dien DATABASE_URL va mat khau Admin manh.
  notepad server\.env
  pause
  exit /b 1
)
if not exist node_modules\.bin\vite.cmd (
  echo Dang cai thu vien OrderHub...
  call npm install
  if errorlevel 1 goto failed
)
start "OrderHub API" cmd /k "cd /d "%~dp0" && npm run dev -w server"
start "OrderHub Web" cmd /k "cd /d "%~dp0" && npm run dev -w client"
timeout /t 4 /nobreak >nul
start "" http://localhost:5173
exit /b 0
:failed
echo Khong the cai thu vien. Kiem tra ket noi Internet/npm, sau do chay lai.
pause
