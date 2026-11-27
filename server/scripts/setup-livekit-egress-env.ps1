<#
.SYNOPSIS
  Securely store LiveKit Egress / webhook settings in server\.env.

.DESCRIPTION
  Prompts for S3-compatible storage, a public development origin and optional
  LiveKit dashboard metadata. Access keys are read with hidden input. Nothing
  secret is printed. Existing .env entries with the same key are replaced;
  all other entries are preserved.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-livekit-egress-env.ps1
#>

$ErrorActionPreference = 'Stop'

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'

function Normalize([string]$value) {
  if ($null -eq $value) { return '' }
  return ($value -replace "[\r\n]+", ' ').Trim()
}

function Quote([string]$value) {
  $escaped = $value.Replace('\', '\\').Replace('"', '\"')
  return '"' + $escaped + '"'
}

function Read-Visible([string]$label, [bool]$required = $true) {
  $value = Normalize (Read-Host -Prompt $label)
  while ($required -and -not $value) {
    Write-Host 'This value is required.' -ForegroundColor Yellow
    $value = Normalize (Read-Host -Prompt $label)
  }
  return $value
}

function Read-Hidden([string]$label, [bool]$required = $true) {
  $secure = Read-Host -Prompt $label -AsSecureString
  $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $value = Normalize ([System.Runtime.InteropServices.Marshal]::PtrToStringUni($pointer))
  } finally {
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $secure.Dispose()
  }
  while ($required -and -not $value) {
    Write-Host 'This value is required.' -ForegroundColor Yellow
    $secure = Read-Host -Prompt $label -AsSecureString
    $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = Normalize ([System.Runtime.InteropServices.Marshal]::PtrToStringUni($pointer))
    } finally {
      [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
      $secure.Dispose()
    }
  }
  return $value
}

function Set-EnvValue([string]$path, [string]$key, [string]$value) {
  $pattern = '^\s*' + [regex]::Escape($key) + '\s*='
  $replacement = $key + '=' + (Quote $value)
  $lines = New-Object System.Collections.Generic.List[string]
  $found = $false

  if (Test-Path -LiteralPath $path) {
    foreach ($line in [System.IO.File]::ReadAllLines($path)) {
      if ($line -match $pattern) {
        $lines.Add($replacement)
        $found = $true
      } else {
        $lines.Add($line)
      }
    }
  }
  if (-not $found) { $lines.Add($replacement) }

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllLines($path, $lines.ToArray(), $utf8NoBom)
}

Write-Host ''
Write-Host 'Mathify LiveKit Egress setup' -ForegroundColor Cyan
Write-Host 'Access key ID and secret access key are hidden while typing.'
Write-Host 'Values are written only to server\.env and are never printed.'
Write-Host ''

$endpoint = Read-Visible 'S3 endpoint (https://<account>.r2.cloudflarestorage.com)'
$bucket = Read-Visible 'Bucket name'
$accessKey = Read-Hidden 'Access key ID (hidden)'
$secretKey = Read-Hidden 'Secret access key (hidden)'
$region = Read-Visible 'Region (use: auto)'
$forcePath = Read-Visible 'Force path style (true for R2, false for AWS S3)'
$publicOrigin = Read-Visible 'Public development URL (https://... or ngrok/cloudflared URL)'
$catalogueUrl = Read-Visible 'Catalogue URL (press Enter if none)' $false
$warehouse = Read-Visible 'Warehouse name (press Enter if none)' $false

Set-EnvValue $envPath 'LIVEKIT_EGRESS_ENDPOINT' $endpoint
Set-EnvValue $envPath 'LIVEKIT_EGRESS_BUCKET' $bucket
Set-EnvValue $envPath 'LIVEKIT_EGRESS_ACCESS_KEY' $accessKey
Set-EnvValue $envPath 'LIVEKIT_EGRESS_SECRET_KEY' $secretKey
Set-EnvValue $envPath 'LIVEKIT_EGRESS_REGION' $region
Set-EnvValue $envPath 'LIVEKIT_EGRESS_FORCE_PATH_STYLE' $forcePath
Set-EnvValue $envPath 'LIVEKIT_EGRESS_KEY_PREFIX' 'mathify'
Set-EnvValue $envPath 'LIVEKIT_EGRESS_LAYOUT' 'grid'
Set-EnvValue $envPath 'APP_ORIGIN' $publicOrigin
Set-EnvValue $envPath 'CORS_ORIGIN' $publicOrigin
Set-EnvValue $envPath 'MATHIFY_TIMEZONE' 'Asia/Kolkata'
Set-EnvValue $envPath 'LIVEKIT_CATALOGUE_URL' $catalogueUrl
Set-EnvValue $envPath 'LIVEKIT_WAREHOUSE_NAME' $warehouse

Write-Host ''
Write-Host 'Saved settings to server\.env. No secret value was displayed.' -ForegroundColor Green
Write-Host ('LiveKit webhook URL to paste in the dashboard: ' + $publicOrigin.TrimEnd('/') + '/api/webhooks/livekit')
Write-Host 'Catalogue URL and warehouse name are stored for reference; Mathify does not consume them.'
Write-Host ''
