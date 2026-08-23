$ErrorActionPreference = 'Stop'

$workspace = 'F:\project\web-project-workflow'
$outputDir = Join-Path $workspace '论文\图表\第3章'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Set-CellValue { param($Shape, [string]$Name, [string]$Formula); $Shape.CellsU($Name).FormulaU = $Formula }
function Set-TextStyle {
    param($Shape, [double]$Size = 9, [string]$Color = 'RGB(51,51,51)', [bool]$Bold = $false, [string]$Align = '1')
    Set-CellValue $Shape 'Char.Font' 'FONT("SimSun")'
    Set-CellValue $Shape 'Char.Size' ("{0} pt" -f $Size)
    Set-CellValue $Shape 'Char.Color' $Color
    Set-CellValue $Shape 'Char.Style' ($(if ($Bold) { '1' } else { '0' }))
    Set-CellValue $Shape 'Para.HorzAlign' $Align
    Set-CellValue $Shape 'VerticalAlign' '1'
}
function Add-Box {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Text, [double]$FontSize = 9, [bool]$Bold = $false, [string]$Fill = 'RGB(255,255,255)', [string]$Line = 'RGB(64,64,64)', [string]$LinePattern = '1')
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    if ([string]::IsNullOrWhiteSpace($Fill)) { Set-CellValue $shape 'FillPattern' '0' } else { Set-CellValue $shape 'FillForegnd' $Fill; Set-CellValue $shape 'FillPattern' '1' }
    Set-CellValue $shape 'LineColor' $Line; Set-CellValue $shape 'LinePattern' $LinePattern; Set-CellValue $shape 'LineWeight' '0.9 pt'
    Set-TextStyle $shape $FontSize 'RGB(51,51,51)' $Bold
    return $shape
}
function Add-Text {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Text, [double]$FontSize = 8, [bool]$Bold = $false, [string]$Color = 'RGB(89,89,89)')
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text; Set-CellValue $shape 'FillPattern' '0'; Set-CellValue $shape 'LinePattern' '0'; Set-TextStyle $shape $FontSize $Color $Bold
    return $shape
}
function Add-Line {
    param($Page, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [bool]$Arrow = $true, [bool]$Dashed = $false, [double]$Weight = 0.9, [string]$Color = 'RGB(64,64,64)')
    $line = $Page.DrawLine($X1, $Y1, $X2, $Y2); Set-CellValue $line 'LineColor' $Color; Set-CellValue $line 'LineWeight' ("{0} pt" -f $Weight)
    if ($Dashed) { Set-CellValue $line 'LinePattern' '2' }; if ($Arrow) { Set-CellValue $line 'EndArrow' '4' }; return $line
}
function Add-Frame {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Label)
    Add-Box $Page $X $Y $Width $Height '' 9 $false $null 'RGB(128,128,128)' '2' | Out-Null
    Add-Box $Page ($X - $Width / 2 + 0.85) ($Y + $Height / 2 - 0.20) 1.50 0.22 $Label 8.5 $true 'RGB(255,255,255)' 'RGB(255,255,255)' | Out-Null
}
function Add-Diamond {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Text, [double]$FontSize = 10)
    Add-Line $Page ($X - $Width / 2) $Y $X ($Y + $Height / 2) $false $false 0.9 | Out-Null
    Add-Line $Page $X ($Y + $Height / 2) ($X + $Width / 2) $Y $false $false 0.9 | Out-Null
    Add-Line $Page ($X + $Width / 2) $Y $X ($Y - $Height / 2) $false $false 0.9 | Out-Null
    Add-Line $Page $X ($Y - $Height / 2) ($X - $Width / 2) $Y $false $false 0.9 | Out-Null
    Add-Text $Page $X $Y ($Width * 0.60) ($Height * 0.44) $Text $FontSize $true 'RGB(51,51,51)' | Out-Null
}
function New-Canvas {
    param([double]$Width, [double]$Height)
    $visio = New-Object -ComObject Visio.Application; $visio.Visible = $false; $visio.AlertResponse = 7
    $document = $visio.Documents.Add(''); $page = $document.Pages.Item(1)
    Set-CellValue $page.PageSheet 'PageWidth' ("{0} in" -f $Width); Set-CellValue $page.PageSheet 'PageHeight' ("{0} in" -f $Height)
    return @{ Visio = $visio; Document = $document; Page = $page }
}
function Save-Canvas {
    param($Canvas, [string]$Name)
    $vsdxPath = Join-Path $outputDir ($Name + '.vsdx'); $pngPath = Join-Path $outputDir ($Name + '.png')
    try { $Canvas.Document.SaveAs($vsdxPath); $Canvas.Page.Export($pngPath); $Canvas.Document.Saved = $true; Write-Output "Created: $vsdxPath"; Write-Output "Preview: $pngPath" }
    finally { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Canvas.Page); try { $Canvas.Document.Close() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Canvas.Document); try { $Canvas.Visio.Quit() } catch {}; [void][Runtime.InteropServices.Marshal]::ReleaseComObject($Canvas.Visio); [GC]::Collect(); [GC]::WaitForPendingFinalizers() }
}

$ink = 'RGB(64,64,64)'; $muted = 'RGB(89,89,89)'; $accent = 'RGB(75,96,112)'

# 图3-3：四层本体与业务映射。核心图元占据画布的主要有效面积。
$canvas = New-Canvas 12.5 6.2; $page = $canvas.Page
Add-Frame $page 6.65 5.03 11.20 1.20 'C 层：业务能力'
Add-Frame $page 6.65 2.98 11.20 3.40 'L1-L3 层：代码结构'
Add-Text $page 0.55 3.75 0.90 0.28 'L1 模块' 10.5 $true $muted | Out-Null; Add-Text $page 0.55 2.75 0.90 0.28 'L2 文件' 10.5 $true $muted | Out-Null; Add-Text $page 0.55 1.75 0.90 0.28 'L3 元素' 10.5 $true $muted | Out-Null
foreach ($item in @(@(2.70,'用户认证'),@(6.65,'订单管理'),@(10.60,'商品管理'))) { Add-Box $page $item[0] 4.92 2.45 0.62 $item[1] 13 $true | Out-Null }
foreach ($item in @(@(2.70,'auth 模块'),@(6.65,'order 模块'),@(10.60,'catalog 模块'))) { Add-Box $page $item[0] 3.75 2.00 0.58 $item[1] 11.5 $true | Out-Null }
foreach ($item in @(@(2.70,'login.vue'),@(6.65,'order.service.ts'),@(10.60,'product-list.vue'))) { Add-Box $page $item[0] 2.75 2.00 0.58 $item[1] 10.5 $false | Out-Null }
foreach ($item in @(@(2.70,'handleLogin()'),@(6.65,'createOrder()'),@(10.60,'loadProducts()'))) { Add-Box $page $item[0] 1.75 2.00 0.58 $item[1] 10.5 $false | Out-Null }
foreach ($x in @(2.70,6.65,10.60)) { Add-Line $page $x 4.61 $x 4.04 $true $true 1.1 $accent | Out-Null; Add-Line $page $x 3.46 $x 3.05 $true $false 1.0 $ink | Out-Null; Add-Line $page $x 2.45 $x 2.05 $true $false 1.0 $ink | Out-Null }
Add-Line $page 3.70 2.75 5.65 2.75 $true $false 1.0 $ink | Out-Null; Add-Line $page 3.70 1.75 5.65 1.75 $true $false 1.0 $ink | Out-Null
Add-Text $page 6.65 0.55 10.40 0.30 '实线：contain / import / call　　　　　　　　　蓝灰虚线：business_map' 9.5 $false $muted | Out-Null
Save-Canvas $canvas '图3-3-能力代码双层本体模型'

# 图3-4：标准流程图，表现 business_map 边的生成与判定过程。
$canvas = New-Canvas 13.5 5.2; $page = $canvas.Page
Add-Box $page 1.05 3.10 1.60 0.72 "能力规范`nCapability Spec" 11 $true | Out-Null
Add-Box $page 3.00 3.10 1.65 0.72 "候选召回`nL1 / L2 / L3" 11 $true | Out-Null
Add-Line $page 1.85 3.10 2.18 3.10 | Out-Null
Add-Frame $page 5.10 3.10 1.95 3.85 '四类证据计算'
foreach ($item in @(@(5.10,4.25,'文档提取'),@(5.10,3.50,'命名匹配'),@(5.10,2.70,'语义匹配'),@(5.10,1.95,'Git 历史'))) { Add-Box $page $item[0] $item[1] 1.40 0.44 $item[2] 10 $false | Out-Null }
Add-Line $page 3.83 3.10 4.12 3.10 $false | Out-Null; Add-Line $page 4.12 1.95 4.12 4.25 $false | Out-Null
foreach ($y in @(4.25,3.50,2.70,1.95)) { Add-Line $page 4.12 $y 4.40 $y | Out-Null }
Add-Line $page 5.80 1.95 5.80 4.25 $false | Out-Null
foreach ($y in @(4.25,3.50,2.70,1.95)) { Add-Line $page 5.80 $y 6.10 $y $false | Out-Null }
Add-Box $page 7.20 3.10 1.70 0.72 "noisy-OR`n权重聚合" 11 $true | Out-Null
Add-Line $page 6.10 3.10 6.35 3.10 | Out-Null
Add-Box $page 9.20 3.10 1.55 0.72 "确定溯源`n权威证据" 11 $true | Out-Null
Add-Line $page 8.05 3.10 8.42 3.10 | Out-Null
Add-Diamond $page 10.90 3.10 1.55 1.20 "权重 ≥`n0.30?" 10
Add-Line $page 9.98 3.10 10.13 3.10 | Out-Null
Add-Box $page 12.55 3.10 1.25 0.72 "生成`nbusiness_map" 9.5 $true 'RGB(255,255,255)' $accent | Out-Null
Add-Line $page 11.68 3.10 11.92 3.10 $true $false 1.0 $accent | Out-Null
Add-Text $page 12.05 3.58 0.55 0.20 '是' 9 $true $accent | Out-Null
Add-Line $page 10.90 2.50 10.90 1.40 $true $true 0.9 $muted | Out-Null
Add-Text $page 10.90 1.72 1.80 0.24 '否：丢弃候选' 9 $false $muted | Out-Null
Save-Canvas $canvas '图3-4-business_map生成流程'

# 图3-5：主流程、预算判定与明确回退节点。
$canvas = New-Canvas 14.5 6.6; $page = $canvas.Page
$flow = @(
    @(1.25, "任务描述 q`nToken 预算 B"),
    @(3.65, "锚点选择`n向量检索 + 映射"),
    @(6.05, "子图裁剪`n加权双向 BFS"),
    @(8.45, "骨架抽取`n距离感知分级"),
    @(10.85, "符号化序列化`n任务上下文 C")
)
foreach ($item in $flow) { Add-Box $page $item[0] 4.80 1.90 1.05 $item[1] 14 $true | Out-Null }
foreach ($x in @(2.20,4.60,7.00,9.40)) { Add-Line $page $x 4.80 ($x + 0.50) 4.80 $true $false 1.0 $ink | Out-Null }

# 序列化结果进入预算判定；通过则输出，超预算则进入降级链并回到子图裁剪。
Add-Line $page 10.85 4.34 10.85 3.82 $true $false 1.0 $ink | Out-Null
Add-Diamond $page 10.85 3.25 1.85 1.30 "tokens(C)`n≤ B?" 13
Add-Box $page 12.85 3.25 1.55 0.90 "输出上下文 C" 14 $true 'RGB(255,255,255)' $accent | Out-Null
Add-Line $page 11.72 3.25 12.12 3.25 $true $false 1.0 $accent | Out-Null
Add-Text $page 11.78 3.66 0.45 0.22 '是' 11.5 $true $accent | Out-Null

Add-Box $page 10.85 1.45 2.35 0.95 "五级降级链`n压缩档→节点→深度`n→边权→锚点" 12.5 $true | Out-Null
Add-Line $page 10.85 2.60 10.85 1.93 $true $true 0.9 $muted | Out-Null
Add-Text $page 11.20 2.18 0.55 0.22 '否' 11.5 $true $muted | Out-Null
Add-Box $page 6.05 1.45 2.00 0.95 "重新裁剪`n再执行骨架抽取" 13 $true | Out-Null
Add-Line $page 9.72 1.45 7.05 1.45 $true $true 1.0 $accent | Out-Null
Add-Line $page 6.05 1.93 6.05 4.28 $true $true 1.0 $accent | Out-Null
Add-Text $page 8.35 1.78 1.70 0.22 '超预算，回到子图裁剪' 10.5 $true $accent | Out-Null
Save-Canvas $canvas '图3-5-图谱驱动任务上下文生成流水线'
