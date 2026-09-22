@echo off
setlocal
cd /d "%~dp0"
echo Building roc_desk-editor (Release)...
cargo build --release -p roc_desk_editor_standalone
if errorlevel 1 (
  echo BUILD FAILED: roc_desk-editor
  exit /b 1
)
if not exist bin mkdir bin
copy /Y "target\release\roc_desk_editor_standalone.exe" "bin\roc_desk-editor.exe" >nul
if errorlevel 1 (
  echo COPY FAILED: roc_desk-editor
  exit /b 1
)
echo BUILD OK: bin\roc_desk-editor.exe
exit /b 0
