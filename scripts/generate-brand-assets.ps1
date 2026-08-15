Add-Type -AssemblyName System.Drawing

$brandDirectory = Join-Path $PSScriptRoot '..\public\brand'
$brandDirectory = [System.IO.Path]::GetFullPath($brandDirectory)
[System.IO.Directory]::CreateDirectory($brandDirectory) | Out-Null

function New-RoundedRectanglePath {
  param(
    [System.Drawing.RectangleF]$Rectangle,
    [float]$Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rectangle.X, $Rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-TifyPlusPulseMark {
  param(
    [System.Drawing.Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$Size
  )

  $scale = $Size / 512
  $circle = [System.Drawing.RectangleF]::new($X + 52 * $scale, $Y + 52 * $scale, 408 * $scale, 408 * $scale)
  $surface = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $circle,
    [System.Drawing.Color]::FromArgb(25, 55, 45),
    [System.Drawing.Color]::FromArgb(6, 8, 18),
    45
  )
  $Graphics.FillEllipse($surface, $circle)
  $surface.Dispose()

  $outerPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(20, 37, 42), 12 * $scale)
  $Graphics.DrawEllipse($outerPen, $circle)
  $outerPen.Dispose()

  $ring = [System.Drawing.RectangleF]::new($X + 76 * $scale, $Y + 76 * $scale, 360 * $scale, 360 * $scale)
  $ringPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(105, 168, 255, 38), 3 * $scale)
  $Graphics.DrawEllipse($ringPen, $ring)
  $ringPen.Dispose()

  [System.Drawing.PointF[]]$points = @(
    [System.Drawing.PointF]::new($X + 104 * $scale, $Y + 260 * $scale),
    [System.Drawing.PointF]::new($X + 176 * $scale, $Y + 260 * $scale),
    [System.Drawing.PointF]::new($X + 206 * $scale, $Y + 164 * $scale),
    [System.Drawing.PointF]::new($X + 264 * $scale, $Y + 354 * $scale),
    [System.Drawing.PointF]::new($X + 306 * $scale, $Y + 210 * $scale),
    [System.Drawing.PointF]::new($X + 337 * $scale, $Y + 292 * $scale),
    [System.Drawing.PointF]::new($X + 408 * $scale, $Y + 292 * $scale)
  )
  $shadowPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(6, 16, 11), 34 * $scale)
  $shadowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $shadowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $shadowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $Graphics.DrawLines($shadowPen, $points)
  $shadowPen.Dispose()

  $pulseBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new($X + 104 * $scale, $Y + 220 * $scale),
    [System.Drawing.PointF]::new($X + 408 * $scale, $Y + 310 * $scale),
    [System.Drawing.Color]::FromArgb(168, 255, 38),
    [System.Drawing.Color]::FromArgb(60, 245, 255)
  )
  $pulsePen = [System.Drawing.Pen]::new($pulseBrush, 18 * $scale)
  $pulsePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pulsePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pulsePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $Graphics.DrawLines($pulsePen, $points)
  $pulsePen.Dispose()
  $pulseBrush.Dispose()
}

function Save-Mark {
  param([int]$Size, [string]$FileName)
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $bitmap.SetResolution(96, 96)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-TifyPlusPulseMark -Graphics $graphics -X 0 -Y 0 -Size $Size
  $bitmap.Save((Join-Path $brandDirectory $FileName), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

Save-Mark -Size 192 -FileName 'tify-plus-mark-192.png'
Save-Mark -Size 512 -FileName 'tify-plus-mark-512.png'

$social = [System.Drawing.Bitmap]::new(1200, 630)
$social.SetResolution(96, 96)
$g = [System.Drawing.Graphics]::FromImage($social)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  [System.Drawing.Rectangle]::new(0, 0, 1200, 630),
  [System.Drawing.Color]::FromArgb(6, 8, 18),
  [System.Drawing.Color]::FromArgb(8, 25, 29),
  18
)
$g.FillRectangle($background, 0, 0, 1200, 630)
$background.Dispose()

$glowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24, 168, 255, 38))
$g.FillEllipse($glowBrush, -180, -250, 700, 700)
$glowBrush.Color = [System.Drawing.Color]::FromArgb(18, 60, 245, 255)
$g.FillEllipse($glowBrush, 930, 330, 520, 520)
$glowBrush.Dispose()

Draw-TifyPlusPulseMark -Graphics $g -X 58 -Y 91 -Size 260

$lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(168, 255, 38))
$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(244, 248, 241))
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(176, 193, 195))
$cyan = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(60, 245, 255))
$titleFont = [System.Drawing.Font]::new('Segoe UI', 68, [System.Drawing.FontStyle]::Bold)
$subtitleFont = [System.Drawing.Font]::new('Segoe UI', 27, [System.Drawing.FontStyle]::Regular)
$labelFont = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 17, [System.Drawing.FontStyle]::Regular)

$g.DrawString('TIFY', $titleFont, $white, 350, 115)
$tifyWidth = $g.MeasureString('TIFY', $titleFont).Width
$g.DrawString('PLUS', $titleFont, $lime, 350 + $tifyWidth - 4, 115)
$g.DrawString('PULSE MUSIC STUDIO', $subtitleFont, $cyan, 355, 225)
$g.DrawString('Analiz et  •  Eşleştir  •  Düzenle  •  Spotify''dan oynat', $smallFont, $muted, 357, 286)

$chipBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(22, 168, 255, 38))
$chipBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(92, 168, 255, 38), 2)
$chipPath = New-RoundedRectanglePath -Rectangle ([System.Drawing.RectangleF]::new(355, 354, 318, 54)) -Radius 18
$g.FillPath($chipBackground, $chipPath)
$g.DrawPath($chipBorder, $chipPath)
$g.DrawString('ÜCRETSİZ  •  GİRİŞ GEREKMEZ', $labelFont, $lime, 377, 366)
$chipPath.Dispose()
$chipBackground.Dispose()
$chipBorder.Dispose()

$g.DrawString('tifyplus.com', $labelFont, $cyan, 357, 485)
$g.DrawString('Bağımsız ürün • Spotify''ın resmi ürünü değildir', $smallFont, $muted, 357, 528)

$lime.Dispose(); $white.Dispose(); $muted.Dispose(); $cyan.Dispose()
$titleFont.Dispose(); $subtitleFont.Dispose(); $labelFont.Dispose(); $smallFont.Dispose()
$social.Save((Join-Path $brandDirectory 'tify-plus-social-1200x630.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$social.Dispose()

Write-Output "Brand assets generated in $brandDirectory"
