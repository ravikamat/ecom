# ==============================================================================
# ECO Command Center v2 - System & Environment Setup PowerShell Script
# ==============================================================================
# This script verifies existing system software (Node.js, Python, Git, Ollama),
# installs missing dependencies via Winget/Pip/NPM, and sets up local runtime configs.
# ==============================================================================

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  ECO Command Center v2 - Automated Environment Setup & Dependency Checker" -ForegroundColor HighContrastWhite
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Utility Functions using Approved Verbs
function Write-Status($message, $type) {
    switch ($type) {
        "INFO"    { Write-Host "[INFO] $message" -ForegroundColor Cyan }
        "SUCCESS" { Write-Host "[SUCCESS] $message" -ForegroundColor Green }
        "WARN"    { Write-Host "[WARN] $message" -ForegroundColor Yellow }
        "ERROR"   { Write-Host "[ERROR] $message" -ForegroundColor Red }
    }
}

function Test-CommandExists($commandName) {
    $cmd = Get-Command $commandName -ErrorAction SilentlyContinue
    return ($null -ne $cmd)
}

# 1. Check Git
Write-Status "Checking Git installation..." "INFO"
if (Test-CommandExists "git") {
    $gitVersion = git --version
    Write-Status "Git is installed: $gitVersion" "SUCCESS"
} else {
    Write-Status "Git was not found in PATH. Attempting automated installation via Winget..." "WARN"
    if (Test-CommandExists "winget") {
        winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
        Write-Status "Git installed successfully. Please restart PowerShell if PATH is not updated." "SUCCESS"
    } else {
        Write-Status "Winget is not available. Please manually install Git from https://git-scm.com/" "ERROR"
    }
}

# 2. Check Node.js (>= 20.0.0 required)
Write-Status "Checking Node.js installation (Version >= 20.0.0 required)..." "INFO"
$nodeInstalled = Test-CommandExists "node"
$nodeValid = $false

if ($nodeInstalled) {
    $nodeVerRaw = (node -v).TrimStart('v')
    $majorVer = [int]($nodeVerRaw.Split('.')[0])
    if ($majorVer -ge 20) {
        Write-Status "Node.js is installed: v$nodeVerRaw (Compatible)" "SUCCESS"
        $nodeValid = $true
    } else {
        Write-Status "Installed Node.js version (v$nodeVerRaw) is below required v20.0.0." "WARN"
    }
}

if (-not $nodeValid) {
    Write-Status "Attempting installation of Node.js LTS (>= v20) via Winget..." "WARN"
    if (Test-CommandExists "winget") {
        winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
        Write-Status "Node.js LTS installed. Restart PowerShell to refresh environment variables." "SUCCESS"
    } else {
        Write-Status "Please download and install Node.js v20+ from https://nodejs.org/" "ERROR"
    }
}

# 3. Check Python (>= 3.10 required)
Write-Status "Checking Python installation (Version >= 3.10 required)..." "INFO"
$pyCmd = $null
if (Test-CommandExists "python") { $pyCmd = "python" }
elseif (Test-CommandExists "python3") { $pyCmd = "python3" }

$pyValid = $false
if ($null -ne $pyCmd) {
    $pyVerRaw = & $pyCmd -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"
    $pyMajor = [int]($pyVerRaw.Split('.')[0])
    $pyMinor = [int]($pyVerRaw.Split('.')[1])

    if ($pyMajor -ge 3 -and $pyMinor -ge 10) {
        Write-Status "Python is installed: $pyVerRaw (Compatible)" "SUCCESS"
        $pyValid = $true
    } else {
        Write-Status "Installed Python version ($pyVerRaw) is below required 3.10." "WARN"
    }
}

if (-not $pyValid) {
    Write-Status "Attempting installation of Python 3.11 via Winget..." "WARN"
    if (Test-CommandExists "winget") {
        winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
        Write-Status "Python installed. Restart PowerShell to refresh environment variables." "SUCCESS"
    } else {
        Write-Status "Please download Python 3.10+ from https://www.python.org/" "ERROR"
    }
}

# 4. Check Ollama (Optional Local AI Server)
Write-Status "Checking Ollama (Local AI Engine)..." "INFO"
if (Test-CommandExists "ollama") {
    $ollamaVer = ollama --version
    Write-Status "Ollama is installed: $ollamaVer" "SUCCESS"
} else {
    Write-Status "Ollama was not found. Attempting installation via Winget..." "WARN"
    if (Test-CommandExists "winget") {
        winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
        Write-Status "Ollama installed successfully." "SUCCESS"
    } else {
        Write-Status "Ollama is recommended for local AI fallback (Qwen 3.6). Download from https://ollama.com/" "WARN"
    }
}

# 5. Environment Config Setup (.env)
Write-Status "Configuring environment variables (.env)..." "INFO"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$envPath = Join-Path $scriptDir ".env"
$envExamplePath = Join-Path $scriptDir ".env.example"

if (-not (Test-Path $envPath)) {
    if (Test-Path $envExamplePath) {
        Copy-Item $envExamplePath $envPath
        Write-Status "Created .env file from .env.example." "SUCCESS"
    } else {
        Write-Status ".env.example not found. Creating default .env..." "WARN"
        "PORT=3000`nNODE_ENV=development`nDB_FILE=eco.db" | Out-File -FilePath $envPath -Encoding utf8
    }
} else {
    Write-Status ".env configuration file exists." "SUCCESS"
}

# 6. Install Node.js Dependencies (npm install)
Write-Status "Installing Node.js packages via npm..." "INFO"
if (Test-Path (Join-Path $scriptDir "package.json")) {
    Push-Location $scriptDir
    try {
        npm install
        Write-Status "NPM dependencies installed successfully." "SUCCESS"
    } catch {
        Write-Status "Failed to install NPM packages: $_" "ERROR"
    }
    Pop-Location
} else {
    Write-Status "package.json not found in current directory!" "ERROR"
}

# 7. Install Python Dependencies (pip install -r requirements.txt)
Write-Status "Installing Python packages via pip..." "INFO"
$reqPath = Join-Path $scriptDir "requirements.txt"
if (Test-Path $reqPath) {
    if ($null -ne $pyCmd) {
        & $pyCmd -m pip install --upgrade pip
        & $pyCmd -m pip install -r $reqPath
        Write-Status "Python requirements installed successfully." "SUCCESS"
    } else {
        Write-Status "Python binary not found. Skipping pip install." "ERROR"
    }
} else {
    Write-Status "requirements.txt not found!" "ERROR"
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  ECO Command Center v2 - Setup Completed Successfully!" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "To launch the server locally:" -ForegroundColor HighContrastWhite
Write-Host "  1. (Optional) Run Ollama:  ollama serve" -ForegroundColor Yellow
Write-Host "  2. Start Web Server:       npm start" -ForegroundColor Yellow
Write-Host "  3. Open Browser at:        http://localhost:3000" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
