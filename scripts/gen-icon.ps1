<#
 * MultiTerm Workbench
 * Copyright (C) 2026 the MultiTerm Workbench author (github.com/andrewtheart)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
#>

# Generates a terminal-style favicon.ico (multi-size) and PNG app icons for MultiTerm.
Add-Type -AssemblyName System.Drawing

function New-MtBitmap {
  param([int]$Size)
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = [double]$Size
  $pad = $s * 0.078
  $radius = $s * 0.1875
  $rectX = $pad; $rectY = $pad; $rectW = $s - 2 * $pad; $rectH = $s - 2 * $pad

  # Rounded-rect terminal window path.
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [float]($radius * 2)
  $path.AddArc([float]$rectX, [float]$rectY, $d, $d, 180, 90)
  $path.AddArc([float]($rectX + $rectW - $d), [float]$rectY, $d, $d, 270, 90)
  $path.AddArc([float]($rectX + $rectW - $d), [float]($rectY + $rectH - $d), $d, $d, 0, 90)
  $path.AddArc([float]$rectX, [float]($rectY + $rectH - $d), $d, $d, 90, 90)
  $path.CloseFigure()

  # Vertical dark gradient background.
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point([int]$rectX, [int]$rectY)),
    (New-Object System.Drawing.Point([int]$rectX, [int]($rectY + $rectH))),
    [System.Drawing.Color]::FromArgb(255, 27, 29, 24),
    [System.Drawing.Color]::FromArgb(255, 12, 13, 11))
  $g.FillPath($brush, $path)

  # Subtle light border.
  $penBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(28, 255, 255, 255), [float]([Math]::Max(1.0, $s * 0.008)))
  $g.DrawPath($penBorder, $path)

  # Prompt chevron ">" (teal).
  $chev = New-Object System.Drawing.Drawing2D.GraphicsPath
  $chev.AddLines(@(
    (New-Object System.Drawing.PointF([float]($s * 0.320), [float]($s * 0.352))),
    (New-Object System.Drawing.PointF([float]($s * 0.492), [float]($s * 0.500))),
    (New-Object System.Drawing.PointF([float]($s * 0.320), [float]($s * 0.648)))
  ))
  $penChev = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 121, 215, 189), [float]($s * 0.086))
  $penChev.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penChev.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $penChev.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($penChev, $chev)

  # Cursor underscore (amber).
  $cx = $s * 0.523; $cy = $s * 0.586; $cw = $s * 0.211; $ch = $s * 0.066
  $cr = $ch / 2
  $cur = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cd = [float]($cr * 2)
  $cur.AddArc([float]$cx, [float]$cy, $cd, $cd, 90, 180)
  $cur.AddArc([float]($cx + $cw - $cd), [float]$cy, $cd, $cd, 270, 180)
  $cur.CloseFigure()
  $brushCur = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 240, 179, 90))
  $g.FillPath($brushCur, $cur)

  $g.Dispose()
  return $bmp
}

function Save-Png {
  param([System.Drawing.Bitmap]$Bitmap, [string]$Path)
  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

$outDir = Join-Path $PSScriptRoot "..\public"
$sizes = 16, 24, 32, 48, 64, 128, 256

# Build PNG byte arrays for each size, then pack into an .ico.
$pngs = @()
foreach ($size in $sizes) {
  $bmp = New-MtBitmap -Size $size
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , @{ Size = $size; Bytes = $ms.ToArray() }
  $ms.Dispose()
  $bmp.Dispose()
}

$icoPath = Join-Path $outDir "favicon.ico"
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)       # reserved
$bw.Write([UInt16]1)       # type = icon
$bw.Write([UInt16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
  $w = if ($p.Size -ge 256) { 0 } else { $p.Size }
  $bw.Write([Byte]$w)      # width
  $bw.Write([Byte]$w)      # height
  $bw.Write([Byte]0)       # colors
  $bw.Write([Byte]0)       # reserved
  $bw.Write([UInt16]1)     # planes
  $bw.Write([UInt16]32)    # bit count
  $bw.Write([UInt32]$p.Bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $p.Bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.Bytes) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()
Write-Host "Wrote $icoPath"

# App icons for the web manifest.
foreach ($size in 192, 512) {
  $bmp = New-MtBitmap -Size $size
  Save-Png -Bitmap $bmp -Path (Join-Path $outDir "icon-$size.png")
  $bmp.Dispose()
  Write-Host "Wrote icon-$size.png"
}

# Reuse the .ico for the installer / Electron window icon.
Copy-Item $icoPath (Join-Path $PSScriptRoot "..\installer\MultiTerm.ico") -Force
Write-Host "Updated installer\MultiTerm.ico"
