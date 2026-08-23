$ErrorActionPreference = 'Stop'

$workspace = 'F:\project\web-project-workflow'
$outputDir = Join-Path $workspace '论文\图表'
$vsdxPath = Join-Path $outputDir '图3-2-六阶段流程约束架构.vsdx'
$pngPath = Join-Path $outputDir '图3-2-六阶段流程约束架构.png'

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Set-CellValue {
    param($Shape, [string]$Name, [string]$Formula)
    $Shape.CellsU($Name).FormulaU = $Formula
}

function Set-TextStyle {
    param($Shape, [double]$Size = 10, [string]$Color = 'RGB(51,51,51)', [bool]$Bold = $false)
    Set-CellValue $Shape 'Char.Font' 'FONT("SimSun")'
    Set-CellValue $Shape 'Char.Size' ("{0} pt" -f $Size)
    Set-CellValue $Shape 'Char.Color' $Color
    Set-CellValue $Shape 'Char.Style' ($(if ($Bold) { '1' } else { '0' }))
    Set-CellValue $Shape 'Para.HorzAlign' '1'
    Set-CellValue $Shape 'VerticalAlign' '1'
}

function Add-Box {
    param(
        $Page, [double]$X, [double]$Y, [double]$Width, [double]$Height,
        [string]$Text, [double]$FontSize = 10, [bool]$Bold = $false,
        [string]$Line = 'RGB(64,64,64)', [string]$Fill = 'RGB(255,255,255)',
        [string]$LinePattern = '1'
    )
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    Set-CellValue $shape 'FillForegnd' $Fill
    Set-CellValue $shape 'FillPattern' '1'
    Set-CellValue $shape 'LineColor' $Line
    Set-CellValue $shape 'LinePattern' $LinePattern
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    Set-TextStyle $shape $FontSize 'RGB(51,51,51)' $Bold
    return $shape
}

function Add-Frame {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height)
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    Set-CellValue $shape 'FillPattern' '0'
    Set-CellValue $shape 'LineColor' 'RGB(89,89,89)'
    Set-CellValue $shape 'LinePattern' '2'
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    return $shape
}

function Add-Text {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Text, [double]$FontSize = 9, [bool]$Bold = $false, [string]$Color = 'RGB(89,89,89)')
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    Set-CellValue $shape 'FillPattern' '0'
    Set-CellValue $shape 'LinePattern' '0'
    Set-TextStyle $shape $FontSize $Color $Bold
    return $shape
}

function Add-Line {
    param($Page, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2, [bool]$Arrow = $true, [bool]$Dashed = $false, [double]$Weight = 0.95)
    $line = $Page.DrawLine($X1, $Y1, $X2, $Y2)
    Set-CellValue $line 'LineColor' 'RGB(64,64,64)'
    Set-CellValue $line 'LineWeight' ("{0} pt" -f $Weight)
    if ($Dashed) { Set-CellValue $line 'LinePattern' '2' }
    if ($Arrow) { Set-CellValue $line 'EndArrow' '4' }
    return $line
}

function Add-DoubleArrow {
    param($Page, [double]$X1, [double]$Y1, [double]$X2, [double]$Y2)
    $line = Add-Line $Page $X1 $Y1 $X2 $Y2 $false $false 0.9
    Set-CellValue $line 'BeginArrow' '4'
    Set-CellValue $line 'EndArrow' '4'
    return $line
}

$visio = $null
$document = $null
$page = $null
try {
    $visio = New-Object -ComObject Visio.Application
    $visio.Visible = $false
    $visio.AlertResponse = 7
    $document = $visio.Documents.Add('')
    $page = $document.Pages.Item(1)
    Set-CellValue $page.PageSheet 'PageWidth' '14 in'
    Set-CellValue $page.PageSheet 'PageHeight' '8 in'
    $ink = 'RGB(64,64,64)'

    # Three compact bands: system controls, six-stage flow, and artifact/knowledge feedback.
    Add-Frame $page 7.0 7.25 12.55 0.90 | Out-Null
    Add-Frame $page 7.0 4.35 12.55 3.75 | Out-Null
    Add-Frame $page 7.0 1.45 12.55 1.20 | Out-Null

    Add-Text $page 0.48 7.25 0.95 0.60 "系统控制`n与门禁" 10 $true | Out-Null
    Add-Text $page 0.48 4.35 0.95 0.60 "六阶段`n流程主链" 10 $true | Out-Null
    Add-Text $page 0.48 1.45 0.95 0.60 "制品沉淀`n与知识反馈" 10 $true | Out-Null

    Add-Box $page 2.55 7.25 3.25 0.48 '强依赖检查：前置阶段完成后方可推进' 10 $false | Out-Null
    Add-Box $page 7.00 7.25 3.25 0.48 '弱依赖读取：可选制品缺失时允许降级' 10 $false | Out-Null
    Add-Box $page 11.45 7.25 3.25 0.48 '拍板门禁：用户确认后进入下一阶段' 10 $false | Out-Null

    Add-Text $page 7.0 5.92 10.8 0.24 '每个阶段遵循“准备—生成—收尾”三段式编排契约' 10 $true 'RGB(64,64,64)' | Out-Null

    $stageX = @(1.75, 3.80, 5.85, 7.90, 9.95, 12.00)
    $stageText = @(
        "BRD`n业务需求",
        "PRD`n产品需求",
        "Design`n技术设计",
        "Plan`n开发计划",
        "Test`n测试方案",
        "Apply`n编码实施"
    )
    for ($i = 0; $i -lt $stageX.Count; $i++) {
        $bold = $i -eq 5
        Add-Box $page $stageX[$i] 4.10 1.62 0.88 $stageText[$i] 13 $bold | Out-Null
    }
    for ($i = 0; $i -lt ($stageX.Count - 1); $i++) {
        Add-Line $page ($stageX[$i] + 0.81) 4.10 ($stageX[$i + 1] - 0.81) 4.10 | Out-Null
    }

    # Explore is an optional branch guarded by an explicit user decision.
    Add-Box $page 5.05 4.95 1.50 0.48 "Explore`n可选探索" 11 $false $ink 'RGB(255,255,255)' '2' | Out-Null
    Add-Box $page 5.05 5.50 1.50 0.38 '用户拍板' 10 $true | Out-Null
    Add-Line $page 4.60 4.56 5.05 4.71 $true $true 0.9 | Out-Null
    Add-Line $page 5.05 5.19 5.05 5.31 $true $true 0.9 | Out-Null
    Add-Line $page 5.53 5.50 5.85 4.56 $true $true 0.9 | Out-Null

    Add-Text $page 7.0 2.82 10.8 0.24 '阶段状态：系统校验、用户确认、状态文件留痕、支持断点恢复' 9 $false | Out-Null

    Add-Box $page 2.15 1.45 2.35 0.56 "阶段制品`n结构化落盘" 11 $false | Out-Null
    Add-Box $page 5.40 1.45 2.35 0.56 "任务上下文`n图谱生成与供给" 11 $false | Out-Null
    Add-Box $page 8.65 1.45 2.35 0.56 "代码交付`n测试与审查" 11 $false | Out-Null
    Add-Box $page 11.90 1.45 2.35 0.56 "需求归档`n知识增量更新" 11 $false | Out-Null
    Add-Line $page 3.33 1.45 4.22 1.45 | Out-Null
    Add-Line $page 6.58 1.45 7.47 1.45 | Out-Null
    Add-Line $page 9.83 1.45 10.72 1.45 | Out-Null
    Add-Line $page 12.00 3.66 11.90 1.75 $true $true 0.9 | Out-Null
    Add-Text $page 12.75 2.65 1.00 0.22 '归档反馈' 9 $false | Out-Null

    Add-DoubleArrow $page 7.0 6.30 7.0 6.85 | Out-Null
    Add-DoubleArrow $page 7.0 1.80 7.0 2.65 | Out-Null
    Add-Text $page 7.55 6.58 1.00 0.20 '门禁控制' 9 $false | Out-Null
    Add-Text $page 7.55 2.22 1.25 0.20 '制品与上下文' 9 $false | Out-Null

    $document.SaveAs($vsdxPath)
    $page.Export($pngPath)
    $document.Saved = $true
}
finally {
    if ($page -ne $null) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page) }
    if ($document -ne $null) {
        try { $document.Close() } catch {}
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
    if ($visio -ne $null) {
        try { $visio.Quit() } catch {}
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($visio)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output "Created: $vsdxPath"
Write-Output "Preview: $pngPath"
