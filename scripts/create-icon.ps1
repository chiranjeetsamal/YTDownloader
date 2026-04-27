Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets"
New-Item -ItemType Directory -Force -Path $assets | Out-Null

function New-YTDownloaderPng {
  param(
    [int]$Size,
    [string]$OutFile
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $rect = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $radius = [single]($Size * 0.22)
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, ([System.Drawing.Color]::FromArgb(255, 255, 52, 52)), ([System.Drawing.Color]::FromArgb(255, 142, 12, 22)), 45
  $graphics.FillPath($bgBrush, $path)

  $glossRect = New-Object System.Drawing.RectangleF ($Size * 0.08), ($Size * 0.07), ($Size * 0.84), ($Size * 0.42)
  $gloss = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gloss.AddEllipse($glossRect)
  $glossBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $glossRect, ([System.Drawing.Color]::FromArgb(78, 255, 255, 255)), ([System.Drawing.Color]::FromArgb(0, 255, 255, 255)), 90
  $graphics.FillPath($glossBrush, $gloss)

  $play = New-Object System.Drawing.Drawing2D.GraphicsPath
  $play.AddPolygon(@(
    (New-Object System.Drawing.PointF ($Size * 0.38), ($Size * 0.29)),
    (New-Object System.Drawing.PointF ($Size * 0.38), ($Size * 0.60)),
    (New-Object System.Drawing.PointF ($Size * 0.65), ($Size * 0.445))
  ))
  $graphics.FillPath(([System.Drawing.Brushes]::White), $play)

  $arrowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
  $shaft = New-Object System.Drawing.RectangleF ($Size * 0.465), ($Size * 0.58), ($Size * 0.07), ($Size * 0.17)
  $graphics.FillRectangle($arrowBrush, $shaft)
  $arrow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $arrow.AddPolygon(@(
    (New-Object System.Drawing.PointF ($Size * 0.36), ($Size * 0.70)),
    (New-Object System.Drawing.PointF ($Size * 0.50), ($Size * 0.84)),
    (New-Object System.Drawing.PointF ($Size * 0.64), ($Size * 0.70))
  ))
  $graphics.FillPath($arrowBrush, $arrow)
  $bar = New-Object System.Drawing.RectangleF ($Size * 0.32), ($Size * 0.86), ($Size * 0.36), ($Size * 0.045)
  $graphics.FillRectangle($arrowBrush, $bar)

  $outlinePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(70, 90, 0, 0)), ([Math]::Max(1, $Size * 0.018))
  $graphics.DrawPath($outlinePen, $path)

  $bitmap.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $outlinePen.Dispose()
  $arrowBrush.Dispose()
  $glossBrush.Dispose()
  $gloss.Dispose()
  $bgBrush.Dispose()
  $path.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Write-IcoFromPngs {
  param(
    [string[]]$PngFiles,
    [string]$OutFile
  )

  $streams = @()
  foreach ($file in $PngFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $image = [System.Drawing.Image]::FromFile($file)
    $streams += [pscustomobject]@{
      Width = $image.Width
      Height = $image.Height
      Bytes = $bytes
    }
    $image.Dispose()
  }

  $out = New-Object System.IO.MemoryStream
  $writer = New-Object System.IO.BinaryWriter $out
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$streams.Count)

  $offset = 6 + (16 * $streams.Count)
  foreach ($entry in $streams) {
    $widthByte = if ($entry.Width -ge 256) { 0 } else { $entry.Width }
    $heightByte = if ($entry.Height -ge 256) { 0 } else { $entry.Height }
    $writer.Write([byte]$widthByte)
    $writer.Write([byte]$heightByte)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$entry.Bytes.Length)
    $writer.Write([UInt32]$offset)
    $offset += $entry.Bytes.Length
  }

  foreach ($entry in $streams) {
    $writer.Write($entry.Bytes)
  }

  [System.IO.File]::WriteAllBytes($OutFile, $out.ToArray())
  $writer.Dispose()
  $out.Dispose()
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @()
foreach ($size in $sizes) {
  $file = Join-Path $assets "icon-$size.png"
  New-YTDownloaderPng -Size $size -OutFile $file
  $pngs += $file
}

Copy-Item -LiteralPath (Join-Path $assets "icon-256.png") -Destination (Join-Path $assets "icon.png") -Force
Write-IcoFromPngs -PngFiles $pngs -OutFile (Join-Path $assets "icon.ico")
Write-Host "Created assets/icon.ico and assets/icon.png"
