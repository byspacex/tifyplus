Add-Type -AssemblyName System.Drawing

$brandDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public\brand'))
[System.IO.Directory]::CreateDirectory($brandDirectory) | Out-Null

function New-RoundedRectanglePath {
  param([System.Drawing.RectangleF]$Rectangle, [float]$Radius)
  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Rectangle.X, $Rectangle.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rectangle.Right - $diameter, $Rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rectangle.X, $Rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-TifyPlusMark {
  param([System.Drawing.Graphics]$Graphics, [float]$X, [float]$Y, [float]$Size)
  $scale = $Size / 512
  $caseRect = [System.Drawing.RectangleF]::new($X + 28*$scale, $Y + 28*$scale, 456*$scale, 456*$scale)
  $casePath = New-RoundedRectanglePath -Rectangle $caseRect -Radius (56*$scale)
  $caseBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($caseRect, [System.Drawing.Color]::FromArgb(34,50,45), [System.Drawing.Color]::FromArgb(5,8,13), 46)
  $Graphics.FillPath($caseBrush, $casePath)
  $edgePen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(42,69,68), 10*$scale)
  $Graphics.DrawPath($edgePen, $casePath)

  [System.Drawing.PointF[]]$tShape = @(
    [System.Drawing.PointF]::new($X+128*$scale,$Y+142*$scale), [System.Drawing.PointF]::new($X+377*$scale,$Y+142*$scale),
    [System.Drawing.PointF]::new($X+338*$scale,$Y+212*$scale), [System.Drawing.PointF]::new($X+265*$scale,$Y+212*$scale),
    [System.Drawing.PointF]::new($X+265*$scale,$Y+370*$scale), [System.Drawing.PointF]::new($X+183*$scale,$Y+370*$scale),
    [System.Drawing.PointF]::new($X+183*$scale,$Y+212*$scale), [System.Drawing.PointF]::new($X+89*$scale,$Y+212*$scale)
  )
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(245,248,244))
  $Graphics.FillPolygon($white, $tShape)

  [System.Drawing.PointF[]]$signal = @(
    [System.Drawing.PointF]::new($X+100*$scale,$Y+316*$scale), [System.Drawing.PointF]::new($X+155*$scale,$Y+316*$scale),
    [System.Drawing.PointF]::new($X+179*$scale,$Y+248*$scale), [System.Drawing.PointF]::new($X+217*$scale,$Y+365*$scale),
    [System.Drawing.PointF]::new($X+251*$scale,$Y+261*$scale), [System.Drawing.PointF]::new($X+277*$scale,$Y+338*$scale),
    [System.Drawing.PointF]::new($X+329*$scale,$Y+338*$scale)
  )
  $signalBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.PointF]::new($X+100*$scale,$Y+280*$scale), [System.Drawing.PointF]::new($X+329*$scale,$Y+350*$scale), [System.Drawing.Color]::FromArgb(60,245,255), [System.Drawing.Color]::FromArgb(168,255,38))
  $signalPen = [System.Drawing.Pen]::new($signalBrush, 15*$scale)
  $signalPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Square
  $signalPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Square
  $signalPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Miter
  $Graphics.DrawLines($signalPen, $signal)

  $lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(168,255,38))
  $Graphics.FillRectangle($lime, $X+365*$scale, $Y+314*$scale, 97*$scale, 35*$scale)
  $Graphics.FillRectangle($lime, $X+396*$scale, $Y+283*$scale, 35*$scale, 97*$scale)

  $caseBrush.Dispose(); $casePath.Dispose(); $edgePen.Dispose(); $white.Dispose(); $signalBrush.Dispose(); $signalPen.Dispose(); $lime.Dispose()
}

function Save-Mark {
  param([int]$Size, [string]$FileName)
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-TifyPlusMark -Graphics $graphics -X 0 -Y 0 -Size $Size
  $bitmap.Save((Join-Path $brandDirectory $FileName), [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose(); $bitmap.Dispose()
}

Save-Mark -Size 192 -FileName 'tify-plus-mark-192.png'
Save-Mark -Size 512 -FileName 'tify-plus-mark-512.png'

$social = [System.Drawing.Bitmap]::new(1200, 630)
$g = [System.Drawing.Graphics]::FromImage($social)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$background = [System.Drawing.Drawing2D.LinearGradientBrush]::new([System.Drawing.Rectangle]::new(0,0,1200,630), [System.Drawing.Color]::FromArgb(6,8,18), [System.Drawing.Color]::FromArgb(8,25,29), 18)
$g.FillRectangle($background,0,0,1200,630)
$glow = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24,168,255,38)); $g.FillEllipse($glow,-180,-250,700,700)
Draw-TifyPlusMark -Graphics $g -X 58 -Y 91 -Size 260

$lime = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(168,255,38)); $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(244,248,241)); $muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(176,193,195)); $cyan = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(60,245,255))
$titleFont = [System.Drawing.Font]::new('Segoe UI',68,[System.Drawing.FontStyle]::Bold); $subtitleFont = [System.Drawing.Font]::new('Segoe UI',27,[System.Drawing.FontStyle]::Regular); $labelFont = [System.Drawing.Font]::new('Segoe UI',18,[System.Drawing.FontStyle]::Bold); $smallFont = [System.Drawing.Font]::new('Segoe UI',17,[System.Drawing.FontStyle]::Regular)
$g.DrawString('TIFY',$titleFont,$white,350,115); $tifyWidth = $g.MeasureString('TIFY',$titleFont).Width; $g.DrawString('PLUS',$titleFont,$lime,350+$tifyWidth-4,115)
$g.DrawString('PERSONAL MUSIC LIBRARY',$subtitleFont,$cyan,355,225)
$g.DrawString('İncele  •  Düzenle  •  Eşleştir  •  Spotify ile oynat',$smallFont,$muted,357,286)
$chipBackground = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(22,168,255,38)); $chipBorder = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(92,168,255,38),2); $chipPath = New-RoundedRectanglePath -Rectangle ([System.Drawing.RectangleF]::new(355,354,318,54)) -Radius 18
$g.FillPath($chipBackground,$chipPath); $g.DrawPath($chipBorder,$chipPath); $g.DrawString('KİŞİSEL  •  GİZLİLİK ODAKLI',$labelFont,$lime,377,366)
$g.DrawString('tifyplus.com',$labelFont,$cyan,357,485); $g.DrawString('Bağımsız ürün • Spotify resmi ürünü değildir',$smallFont,$muted,357,528)
$social.Save((Join-Path $brandDirectory 'tify-plus-social-1200x630.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$background.Dispose(); $glow.Dispose(); $lime.Dispose(); $white.Dispose(); $muted.Dispose(); $cyan.Dispose(); $titleFont.Dispose(); $subtitleFont.Dispose(); $labelFont.Dispose(); $smallFont.Dispose(); $chipBackground.Dispose(); $chipBorder.Dispose(); $chipPath.Dispose(); $g.Dispose(); $social.Dispose()

Write-Output "Tify Plus brand assets generated in $brandDirectory"
