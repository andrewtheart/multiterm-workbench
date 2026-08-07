#Requires -Version 5.1
<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author
 * SPDX-License-Identifier: GPL-3.0-or-later
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptRoot
$sourceIcon = Join-Path $repoRoot 'public\icon-512.png'
$assetRoot = Join-Path $repoRoot 'installer\assets'
$wizardPath = Join-Path $assetRoot 'wizard-dark.png'
$smallPath = Join-Path $assetRoot 'wizard-small-dark.png'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
    param(
        [float]$X,
        [float]$Y,
        [float]$Width,
        [float]$Height,
        [float]$Radius
    )

    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $diameter = $Radius * 2
    $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
    $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
    $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function Save-Png {
    param(
        [Parameter(Mandatory = $true)][System.Drawing.Bitmap]$Bitmap,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created $Path"
}

if (-not (Test-Path -LiteralPath $sourceIcon -PathType Leaf)) {
    throw "MultiTerm icon was not found: $sourceIcon"
}
New-Item -ItemType Directory -Path $assetRoot -Force | Out-Null

$background = [System.Drawing.Color]::FromArgb(255, 16, 19, 25)
$surface = [System.Drawing.Color]::FromArgb(255, 28, 34, 42)
$grid = [System.Drawing.Color]::FromArgb(255, 34, 42, 51)
$accent = [System.Drawing.Color]::FromArgb(255, 49, 201, 154)
$text = [System.Drawing.Color]::FromArgb(255, 242, 245, 248)
$muted = [System.Drawing.Color]::FromArgb(255, 152, 164, 178)

$icon = [System.Drawing.Image]::FromFile($sourceIcon)
try {
    $wizard = [System.Drawing.Bitmap]::new(492, 942, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($wizard)
        try {
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.Clear($background)

            $gridPen = [System.Drawing.Pen]::new($grid, 2)
            try {
                for ($x = 0; $x -lt $wizard.Width; $x += 54) {
                    $graphics.DrawLine($gridPen, $x, 0, $x, $wizard.Height)
                }
                for ($y = 0; $y -lt $wizard.Height; $y += 54) {
                    $graphics.DrawLine($gridPen, 0, $y, $wizard.Width, $y)
                }
            }
            finally {
                $gridPen.Dispose()
            }

            $accentBrush = [System.Drawing.SolidBrush]::new($accent)
            $surfaceBrush = [System.Drawing.SolidBrush]::new($surface)
            try {
                $graphics.FillRectangle($accentBrush, 0, 0, 10, $wizard.Height)
                $terminalPath = New-RoundedRectanglePath -X 58 -Y 224 -Width 376 -Height 410 -Radius 22
                try {
                    $graphics.FillPath($surfaceBrush, $terminalPath)
                }
                finally {
                    $terminalPath.Dispose()
                }
                $graphics.FillRectangle($accentBrush, 58, 224, 376, 8)
                $graphics.DrawImage($icon, 122, 301, 248, 248)
            }
            finally {
                $accentBrush.Dispose()
                $surfaceBrush.Dispose()
            }

            $titleFont = [System.Drawing.Font]::new('Segoe UI Semibold', 31, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
            $captionFont = [System.Drawing.Font]::new('Segoe UI', 19, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
            $textBrush = [System.Drawing.SolidBrush]::new($text)
            $mutedBrush = [System.Drawing.SolidBrush]::new($muted)
            $accentTextBrush = [System.Drawing.SolidBrush]::new($accent)
            try {
                $graphics.DrawString('MULTITERM', $titleFont, $textBrush, 58, 86)
                $graphics.DrawString('WORKBENCH', $captionFont, $accentTextBrush, 60, 132)
                $graphics.DrawString('One workspace. Every terminal.', $captionFont, $mutedBrush, 58, 714)
                $graphics.DrawString('Secure local sessions', $captionFont, $textBrush, 58, 770)
            }
            finally {
                $titleFont.Dispose()
                $captionFont.Dispose()
                $textBrush.Dispose()
                $mutedBrush.Dispose()
                $accentTextBrush.Dispose()
            }
        }
        finally {
            $graphics.Dispose()
        }
        Save-Png -Bitmap $wizard -Path $wizardPath
    }
    finally {
        $wizard.Dispose()
    }

    $small = [System.Drawing.Bitmap]::new(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
        $graphics = [System.Drawing.Graphics]::FromImage($small)
        try {
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.DrawImage($icon, 0, 0, 256, 256)
        }
        finally {
            $graphics.Dispose()
        }
        Save-Png -Bitmap $small -Path $smallPath
    }
    finally {
        $small.Dispose()
    }
}
finally {
    $icon.Dispose()
}