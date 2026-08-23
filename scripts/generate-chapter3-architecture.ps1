$ErrorActionPreference = 'Stop'

$workspace = 'F:\project\web-project-workflow'
$outputDir = Join-Path $workspace '论文\图表'
$vsdxPath = Join-Path $outputDir '图3-1-方法总体框架.vsdx'
$pngPath = Join-Path $outputDir '图3-1-方法总体框架.png'

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Set-CellValue {
    param(
        [Parameter(Mandatory = $true)] $Shape,
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [string] $Formula
    )
    $Shape.CellsU($Name).FormulaU = $Formula
}

function Set-TextStyle {
    param(
        [Parameter(Mandatory = $true)] $Shape,
        [double] $Size = 9,
        [string] $Color = 'RGB(31,41,55)',
        [bool] $Bold = $false,
        [string] $Align = '1'
    )
    $Size = $Size * 2
    Set-CellValue $Shape 'Char.Font' 'FONT("SimSun")'
    Set-CellValue $Shape 'Char.Size' ("{0} pt" -f $Size)
    Set-CellValue $Shape 'Char.Color' $Color
    Set-CellValue $Shape 'Para.HorzAlign' $Align
    Set-CellValue $Shape 'VerticalAlign' '1'
    Set-CellValue $Shape 'Char.Style' ($(if ($Bold) { '1' } else { '0' }))
}

function Add-Box {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X,
        [double] $Y,
        [double] $Width,
        [double] $Height,
        [Parameter(Mandatory = $true)] [string] $Text,
        [string] $Fill = 'RGB(255,255,255)',
        [string] $Line = 'RGB(64,64,64)',
        [double] $FontSize = 9,
        [bool] $Bold = $false,
        [string] $TextColor = 'RGB(51,51,51)'
    )
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    if ([string]::IsNullOrWhiteSpace($Fill)) {
        Set-CellValue $shape 'FillPattern' '0'
    }
    else {
        Set-CellValue $shape 'FillForegnd' $Fill
        Set-CellValue $shape 'FillPattern' '1'
    }
    Set-CellValue $shape 'LineColor' $Line
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    Set-TextStyle $shape $FontSize $TextColor $Bold
    return $shape
}

function Add-TextBox {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X,
        [double] $Y,
        [double] $Width,
        [double] $Height,
        [Parameter(Mandatory = $true)] [string] $Text,
        [double] $FontSize = 9,
        [bool] $Bold = $false,
        [string] $TextColor = 'RGB(64,64,64)',
        [string] $Align = '1'
    )
    $Height = $Height * 2
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    Set-CellValue $shape 'FillPattern' '0'
    Set-CellValue $shape 'LinePattern' '0'
    Set-TextStyle $shape $FontSize $TextColor $Bold $Align
    return $shape
}

function Add-Arrow {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X1,
        [double] $Y1,
        [double] $X2,
        [double] $Y2,
        [string] $Color = 'RGB(64,64,64)',
        [double] $Weight = 1.0
    )
    $line = $Page.DrawLine($X1, $Y1, $X2, $Y2)
    Set-CellValue $line 'LineColor' $Color
    Set-CellValue $line 'LineWeight' ("{0} pt" -f $Weight)
    Set-CellValue $line 'EndArrow' '4'
    return $line
}

function Add-DoubleArrow {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X1,
        [double] $Y1,
        [double] $X2,
        [double] $Y2,
        [double] $Weight = 1.0
    )
    $line = $Page.DrawLine($X1, $Y1, $X2, $Y2)
    Set-CellValue $line 'LineColor' 'RGB(64,64,64)'
    Set-CellValue $line 'LineWeight' ("{0} pt" -f $Weight)
    Set-CellValue $line 'BeginArrow' '4'
    Set-CellValue $line 'EndArrow' '4'
    return $line
}

function Add-Frame {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X,
        [double] $Y,
        [double] $Width,
        [double] $Height
    )
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    Set-CellValue $shape 'FillPattern' '0'
    Set-CellValue $shape 'LineColor' 'RGB(64,64,64)'
    Set-CellValue $shape 'LinePattern' '2'
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    return $shape
}

function Add-Oval {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X,
        [double] $Y,
        [double] $Width,
        [double] $Height,
        [Parameter(Mandatory = $true)] [string] $Text,
        [double] $FontSize = 9
    )
    $shape = $Page.DrawOval($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    Set-CellValue $shape 'FillForegnd' 'RGB(255,255,255)'
    Set-CellValue $shape 'FillPattern' '1'
    Set-CellValue $shape 'LineColor' 'RGB(64,64,64)'
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    Set-TextStyle $shape $FontSize 'RGB(51,51,51)' $false
    return $shape
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

    Set-CellValue $page.PageSheet 'PageWidth' '13 in'
    Set-CellValue $page.PageSheet 'PageHeight' '11.8 in'

    $ink = 'RGB(64,64,64)'
    $muted = 'RGB(89,89,89)'

    # The four dashed bands follow the reference architecture style.
    Add-Frame $page 6.95 10.65 11.25 1.70 | Out-Null
    Add-Frame $page 6.95 8.35 11.25 2.10 | Out-Null
    Add-Frame $page 6.95 5.95 11.25 1.55 | Out-Null
    Add-Frame $page 6.95 3.70 11.25 1.35 | Out-Null

    Add-TextBox $page 0.55 10.65 1.35 1.05 "智能体`n消费层" 7.5 $false $muted | Out-Null
    Add-TextBox $page 0.55 8.35 1.35 1.05 "知识`n组织层" 7.5 $false $muted | Out-Null
    Add-TextBox $page 0.55 5.95 1.35 1.05 "解析与`n融合层" 7.5 $false $muted | Out-Null
    Add-TextBox $page 0.55 3.70 1.35 1.05 "项目知识`n来源层" 7.5 $false $muted | Out-Null

    Add-TextBox $page 6.95 11.18 10.55 0.22 '需求驱动流程与任务级上下文消费' 8 $true $ink | Out-Null
    Add-Box $page 2.45 10.65 1.95 0.72 "需求输入`nBRD / PRD" $null $ink 10 $false $ink | Out-Null
    Add-Box $page 4.75 10.65 2.05 0.72 "六阶段流程`n制品与门禁" $null $ink 10 $false $ink | Out-Null
    Add-Box $page 7.25 10.65 2.05 0.72 "任务上下文`n图谱生成" $null $ink 10 $false $ink | Out-Null
    Add-Box $page 9.75 10.65 2.05 0.72 "智能体实施`n代码变更" $null $ink 10 $false $ink | Out-Null
    Add-Box $page 11.73 10.65 1.05 0.72 "归档`n反馈" $null $ink 9 $false $ink | Out-Null
    Add-Arrow $page 3.45 10.65 3.60 10.65 $ink 0.9 | Out-Null
    Add-Arrow $page 5.78 10.65 6.22 10.65 $ink 0.9 | Out-Null
    Add-Arrow $page 8.28 10.65 8.72 10.65 $ink 0.9 | Out-Null
    Add-Arrow $page 10.78 10.65 11.20 10.65 $ink 0.9 | Out-Null

    Add-TextBox $page 6.95 9.08 10.55 0.22 'Capability-Code 双层知识模型与 Spec 增量演化' 8 $true $ink | Out-Null
    Add-Box $page 3.20 8.35 2.20 0.82 "Capability 层`n业务能力规范" $null $ink 10 $false $ink | Out-Null
    Add-Box $page 5.70 8.35 2.20 0.82 "项目知识图谱`nC-Code 双层" $null $ink 10.5 $true $ink | Out-Null
    Add-Box $page 8.20 8.35 2.20 0.82 "业务-代码关联`nbusiness_map" $null $ink 10 $false $ink | Out-Null
    Add-Box $page 10.70 8.35 2.20 0.82 "Spec 增量演化`n归档沉淀与更新" $null $ink 9.5 $false $ink | Out-Null
    Add-Arrow $page 4.30 8.35 4.60 8.35 $ink 0.9 | Out-Null
    Add-Arrow $page 6.80 8.35 7.10 8.35 $ink 0.9 | Out-Null
    Add-Arrow $page 9.30 8.35 9.60 8.35 $ink 0.9 | Out-Null
    Add-TextBox $page 6.95 7.55 10.55 0.22 '可查询、可追溯、可增量更新的项目知识图谱' 8 $false $muted | Out-Null

    Add-TextBox $page 6.95 6.405 10.55 0.22 '过程制品、源码与历史证据的结构化解析和融合' 8 $true $ink | Out-Null
    Add-Box $page 3.20 5.85 2.20 0.70 "Spec / 过程文档`n结构化解析" $null $ink 9.5 $false $ink | Out-Null
    Add-Box $page 5.70 5.85 2.20 0.70 "多语言源码`n结构解析" $null $ink 9.5 $false $ink | Out-Null
    Add-Box $page 8.20 5.85 2.20 0.70 "Git 历史`n证据提取" $null $ink 9.5 $false $ink | Out-Null
    Add-Box $page 10.70 5.85 2.20 0.70 "多源证据`n置信度融合" $null $ink 9.5 $false $ink | Out-Null
    Add-Arrow $page 4.30 5.85 4.60 5.85 $ink 0.9 | Out-Null
    Add-Arrow $page 6.80 5.85 7.10 5.85 $ink 0.9 | Out-Null
    Add-Arrow $page 9.30 5.85 9.60 5.85 $ink 0.9 | Out-Null

    Add-TextBox $page 6.95 4.055 10.55 0.22 '项目长期知识与当前任务过程知识的原始来源' 8 $true $ink | Out-Null
    Add-Oval $page 3.20 3.55 2.05 0.68 '能力规范' 10 | Out-Null
    Add-Oval $page 5.70 3.55 2.05 0.68 '需求过程制品' 10 | Out-Null
    Add-Oval $page 8.20 3.55 2.05 0.68 '多语言源码' 10 | Out-Null
    Add-Oval $page 10.70 3.55 2.05 0.68 'Git 历史' 10 | Out-Null

    Add-DoubleArrow $page 6.95 9.48 6.95 9.72 0.9 | Out-Null
    Add-DoubleArrow $page 6.95 6.78 6.95 7.20 0.9 | Out-Null
    Add-DoubleArrow $page 6.95 4.42 6.95 4.98 0.9 | Out-Null
    Add-TextBox $page 7.85 9.60 1.80 0.20 '上下文供给' 6.5 $false $muted | Out-Null
    Add-TextBox $page 7.85 6.96 1.80 0.20 '知识组织' 6.5 $false $muted | Out-Null
    Add-TextBox $page 7.85 4.70 1.80 0.20 '解析融合' 6.5 $false $muted | Out-Null

    $document.SaveAs($vsdxPath)
    $page.Export($pngPath)
    $document.Saved = $true
}
finally {
    if ($page -ne $null) {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page)
    }
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
