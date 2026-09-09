Add-Type -AssemblyName System.Drawing

$src = 'C:\Users\Cent\Downloads\616740432_1410049117580253_3879686039924301689_n.jpg'
$root = 'F:\XAMPP\htdocs\HOPE ID SCANNER'
$assetsDir = Join-Path $root 'renderer\assets'
$buildDir = Join-Path $root 'build'
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

$img = [System.Drawing.Image]::FromFile($src)

$ui = New-Object System.Drawing.Bitmap 512, 512
$g = [System.Drawing.Graphics]::FromImage($ui)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.DrawImage($img, 0, 0, 512, 512)
$g.Dispose()
$ui.Save((Join-Path $assetsDir 'logo.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$ui.Dispose()

$sizes = 16, 24, 32, 48, 64, 128, 256
$entries = @()
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($img, 0, 0, $s, $s)
    $g.Dispose()
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $entries += , @($s, $ms.ToArray())
    $bmp.Dispose()
}
$img.Dispose()

$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($out)
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$entries.Count)
$offset = 6 + 16 * $entries.Count
foreach ($e in $entries) {
    $s = $e[0]
    $b = $(if ($s -ge 256) { 0 } else { $s })
    $bw.Write([byte]$b)
    $bw.Write([byte]$b)
    $bw.Write([byte]0)
    $bw.Write([byte]0)
    $bw.Write([uint16]1)
    $bw.Write([uint16]32)
    $bw.Write([uint32]$e[1].Length)
    $bw.Write([uint32]$offset)
    $offset += $e[1].Length
}
foreach ($e in $entries) { $bw.Write($e[1]) }
$bw.Flush()
$icoPath = Join-Path $buildDir 'icon.ico'
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())

Write-Output ('logo.png: ' + (Get-Item (Join-Path $assetsDir 'logo.png')).Length + ' bytes')
Write-Output ('icon.ico: ' + (Get-Item $icoPath).Length + ' bytes')
