@echo off
setlocal EnableExtensions
REM Visual Studio 2026 Community ships link.exe without msvcrt.lib.
REM Load VS 2022 Build Tools so rustc links against a complete C runtime.

if exist "%USERPROFILE%\.cargo\bin\rustc.exe" set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if not exist "%VCVARS%" goto :missing

call "%VCVARS%" >nul
if errorlevel 1 goto :vcfail

npm run tauri -w @aerolith/desktop -- dev %*
exit /b %ERRORLEVEL%

:missing
echo Could not find Visual Studio 2022 Build Tools vcvars64.bat
echo Install Desktop development with C++ for Build Tools 2022, then retry.
exit /b 1

:vcfail
echo Failed to load the MSVC environment from:
echo   %VCVARS%
exit /b 1
