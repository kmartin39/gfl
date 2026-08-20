# Rebinds the Brother PT-D600 USB device between its normal printer driver
# (for P-touch Editor / Windows printing) and the libusbK driver (for the
# GFL print agent). Both driver packages must already be present in the
# Windows driver store -- the Brother one ships with the printer install,
# the libusbK one is added the first time you run Zadig and select
# "libusbK" for the device. This script just re-selects between them, the
# same as Device Manager -> Update driver -> "Let me pick from a list".
#
# Must run elevated (pnputil /install and /restart-device require admin).
# Launched via Start-Process -Verb RunAs from the .bat wrappers, which also
# tee output to switch-driver.log so failures are visible even though the
# elevated console window closes when the script exits.

param(
    [Parameter(Mandatory)]
    [ValidateSet('libusbk', 'brother')]
    [string]$Target
)

$ErrorActionPreference = 'Stop'
$logPath = Join-Path $PSScriptRoot 'switch-driver.log'
Start-Transcript -Path $logPath -Force | Out-Null

try {
    function Get-PublishedInf([string]$originalNamePattern) {
        $text = (pnputil /enum-drivers | Out-String)
        $records = $text -split "(?:\r?\n){2,}"
        foreach ($r in $records) {
            if ($r -match "Original Name:\s*$originalNamePattern") {
                if ($r -match 'Published Name:\s*(\S+)') { return $matches[1] }
            }
        }
        return $null
    }

    $originalNamePattern = if ($Target -eq 'libusbk') { 'pt-d600\.inf' } else { 'bspd60v\.inf' }
    $inf = Get-PublishedInf $originalNamePattern

    if (-not $inf) {
        if ($Target -eq 'libusbk') {
            throw "Could not find the libusbK driver package for the PT-D600 in the Windows driver store. Run Zadig once first (select PT-D600, driver = libusbK, Replace Driver) -- after that this script can switch back and forth without Zadig."
        } else {
            throw "Could not find the Brother printer driver package (bspd60v.inf) in the Windows driver store. Reinstall the Brother printer driver, then this script can switch back and forth."
        }
    }

    $infPath = Join-Path $env:WINDIR "INF\$inf"
    Write-Output "Switching PT-D600 to '$Target' driver ($inf)..."
    & pnputil /add-driver "$infPath" /install
    if ($LASTEXITCODE -ne 0) { throw "pnputil /add-driver exited with code $LASTEXITCODE" }

    # /add-driver /install re-selects the driver but doesn't always force the
    # device to fully re-enumerate (rebuild composite child nodes like the
    # USBPRINT print-class interface + spooler port). Restarting the device
    # forces that, the same as an unplug/replug would.
    $device = Get-PnpDevice | Where-Object { $_.InstanceId -match 'VID_04F9&PID_2074' -and $_.Class -eq 'USB' } | Select-Object -First 1
    if ($device) {
        Write-Output "Restarting device $($device.InstanceId) to force re-enumeration..."
        & pnputil /restart-device "$($device.InstanceId)"
        if ($LASTEXITCODE -ne 0) { Write-Warning "pnputil /restart-device exited with code $LASTEXITCODE (driver switch itself still succeeded)" }
    } else {
        Write-Warning "Could not find the raw USB device node to restart -- if the printer doesn't show up correctly, unplug and replug it."
    }

    Write-Output "Done."
    Stop-Transcript | Out-Null
    exit 0
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    Stop-Transcript | Out-Null
    Write-Host "`nPress Enter to close..." -NoNewline
    Read-Host | Out-Null
    exit 1
}
