$ErrorActionPreference = 'Stop'

$workspace = 'F:\project\web-project-workflow'
$outputDir = Join-Path $workspace '论文\图表\第4章'
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

function Set-CellValue {
    param($Shape, [string]$Name, [string]$Formula)
    $Shape.CellsU($Name).FormulaU = $Formula
}

function Set-TextStyle {
    param(
        $Shape,
        [double]$Size = 9,
        [string]$Color = 'RGB(51,51,51)',
        [bool]$Bold = $false,
        [string]$Align = '1'
    )
    Set-CellValue $Shape 'Char.Font' 'FONT("SimSun")'
    Set-CellValue $Shape 'Char.Size' ("{0} pt" -f ($Size * 2))
    Set-CellValue $Shape 'Char.Color' $Color
    Set-CellValue $Shape 'Char.Style' ($(if ($Bold) { '1' } else { '0' }))
    Set-CellValue $Shape 'Para.HorzAlign' $Align
    Set-CellValue $Shape 'VerticalAlign' '1'
}

function Add-Box {
    param(
        $Page,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Text,
        [double]$FontSize = 9,
        [bool]$Bold = $false,
        [string]$Fill = 'RGB(255,255,255)',
        [string]$Line = 'RGB(64,64,64)',
        [string]$TextColor = 'RGB(51,51,51)',
        [string]$LinePattern = '1'
    )
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    if ([string]::IsNullOrWhiteSpace($Fill)) {
        Set-CellValue $shape 'FillPattern' '0'
    } else {
        Set-CellValue $shape 'FillForegnd' $Fill
        Set-CellValue $shape 'FillPattern' '1'
    }
    Set-CellValue $shape 'LineColor' $Line
    Set-CellValue $shape 'LinePattern' $LinePattern
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    Set-TextStyle $shape $FontSize $TextColor $Bold
    return $shape
}

function Add-Text {
    param(
        $Page,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Text,
        [double]$FontSize = 8,
        [bool]$Bold = $false,
        [string]$Color = 'RGB(89,89,89)',
        [string]$Align = '1'
    )
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    $shape.Text = $Text
    Set-CellValue $shape 'FillPattern' '0'
    Set-CellValue $shape 'LinePattern' '0'
    Set-TextStyle $shape $FontSize $Color $Bold $Align
    return $shape
}

function Add-Frame {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height)
    $shape = $Page.DrawRectangle($X - $Width / 2, $Y - $Height / 2, $X + $Width / 2, $Y + $Height / 2)
    Set-CellValue $shape 'FillPattern' '0'
    Set-CellValue $shape 'LineColor' 'RGB(102,102,102)'
    Set-CellValue $shape 'LinePattern' '2'
    Set-CellValue $shape 'LineWeight' '0.8 pt'
    return $shape
}

function Add-Arrow {
    param(
        $Page,
        [double]$X1,
        [double]$Y1,
        [double]$X2,
        [double]$Y2,
        [bool]$Dashed = $false,
        [bool]$Double = $false,
        [string]$Color = 'RGB(64,64,64)',
        [double]$Weight = 0.95
    )
    $line = $Page.DrawLine($X1, $Y1, $X2, $Y2)
    Set-CellValue $line 'LineColor' $Color
    Set-CellValue $line 'LineWeight' ("{0} pt" -f $Weight)
    if ($Dashed) { Set-CellValue $line 'LinePattern' '2' }
    if ($Double) { Set-CellValue $line 'BeginArrow' '4' }
    Set-CellValue $line 'EndArrow' '4'
    return $line
}

function Add-Line {
    param(
        $Page,
        [double]$X1,
        [double]$Y1,
        [double]$X2,
        [double]$Y2,
        [bool]$Dashed = $false,
        [string]$Color = 'RGB(64,64,64)',
        [double]$Weight = 0.95
    )
    $line = $Page.DrawLine($X1, $Y1, $X2, $Y2)
    Set-CellValue $line 'LineColor' $Color
    Set-CellValue $line 'LineWeight' ("{0} pt" -f $Weight)
    if ($Dashed) { Set-CellValue $line 'LinePattern' '2' }
    return $line
}

function Add-Diamond {
    param($Page, [double]$X, [double]$Y, [double]$Width, [double]$Height, [string]$Text)
    $left = $X - $Width / 2
    $right = $X + $Width / 2
    $top = $Y + $Height / 2
    $bottom = $Y - $Height / 2
    $edges = @(
        @($left, $Y, $X, $top),
        @($X, $top, $right, $Y),
        @($right, $Y, $X, $bottom),
        @($X, $bottom, $left, $Y)
    )
    foreach ($edge in $edges) {
        Add-Line $Page $edge[0] $edge[1] $edge[2] $edge[3] | Out-Null
    }
    Add-Text $Page $X $Y ($Width * 0.72) ($Height * 0.46) $Text 8.5 $true 'RGB(51,51,51)' | Out-Null
}

function New-FigureDocument {
    param($Visio, [double]$Width, [double]$Height)
    $document = $Visio.Documents.Add('')
    $page = $document.Pages.Item(1)
    Set-CellValue $page.PageSheet 'PageWidth' ("{0} in" -f $Width)
    Set-CellValue $page.PageSheet 'PageHeight' ("{0} in" -f $Height)
    return @($document, $page)
}

function Save-Figure {
    param($Document, $Page, [string]$BaseName)
    $vsdx = Join-Path $outputDir ($BaseName + '.vsdx')
    $png = Join-Path $outputDir ($BaseName + '.png')
    $Document.SaveAs($vsdx)
    $Page.Export($png)
    $Document.Saved = $true
    Write-Output "Created: $vsdx"
    Write-Output "Preview: $png"
}

function Draw-Figure41 {
    param($Visio)
    $parts = New-FigureDocument $Visio 15.6 9.2
    $document = $parts[0]; $page = $parts[1]
    try {
        # Four fixed columns keep every cross-layer relationship vertical.
        $x = @(2.80, 6.20, 9.60, 13.00)
        Add-Box $page 0.95 7.95 1.55 0.44 'AI 层' 9.5 $true 'RGB(255,255,255)' 'RGB(255,255,255)' 'RGB(89,89,89)' '0' | Out-Null
        Add-Box $page 0.95 5.15 1.55 0.44 'CLI 层' 9.5 $true 'RGB(255,255,255)' 'RGB(255,255,255)' 'RGB(89,89,89)' '0' | Out-Null
        Add-Box $page 0.95 2.35 1.55 0.44 '文件系统层' 9.2 $true 'RGB(255,255,255)' 'RGB(255,255,255)' 'RGB(89,89,89)' '0' | Out-Null

        Add-Box $page $x[0] 7.95 2.35 0.72 "开发者" 10.5 $false | Out-Null
        Add-Box $page $x[1] 7.95 2.80 0.72 "主 Skill 与阶段命令`n/wpw:xxx" 9.6 $true | Out-Null
        Add-Box $page $x[2] 7.95 2.60 0.72 "AI 编程智能体`n理解、生成与交互" 9.2 $false | Out-Null
        Add-Arrow $page ($x[0] + 1.18) 7.95 ($x[1] - 1.40) 7.95 $false $true | Out-Null
        Add-Arrow $page ($x[1] + 1.40) 7.95 ($x[2] - 1.30) 7.95 | Out-Null
        Add-Text $page 4.50 8.68 1.20 0.18 '需求与确认' 7.0 $false | Out-Null

        Add-Box $page $x[0] 5.15 2.45 0.78 "工作流命令`nnew / check / done" 9.0 $false | Out-Null
        Add-Box $page $x[1] 5.15 2.90 0.78 "状态与任务服务`nSchema / 模板 / 任务" 8.6 $false | Out-Null
        Add-Box $page $x[2] 5.15 2.55 0.78 "图谱与上下文服务`n构建 / 查询 / 生成" 8.8 $false | Out-Null
        Add-Box $page $x[3] 5.15 2.45 0.78 "归档与配置服务`n归档 / 更新 / 配置" 8.7 $false | Out-Null
        Add-Arrow $page ($x[0] + 1.23) 5.15 ($x[1] - 1.28) 5.15 | Out-Null
        Add-Arrow $page ($x[1] + 1.28) 5.15 ($x[2] - 1.28) 5.15 | Out-Null
        Add-Arrow $page ($x[2] + 1.28) 5.15 ($x[3] - 1.23) 5.15 | Out-Null

        Add-Box $page $x[0] 2.35 2.45 0.78 "过程工作区`nwpw/active/" 9.0 $false | Out-Null
        Add-Box $page $x[1] 2.35 2.45 0.78 "状态文件`n.wpw.yaml" 9.0 $false | Out-Null
        Add-Box $page $x[2] 2.35 2.45 0.78 "本地图谱与索引`nJSONL / Vector" 8.7 $false | Out-Null
        Add-Box $page $x[3] 2.35 2.45 0.78 "能力规范与项目配置`nwpw/specs / config.yaml" 8.2 $false | Out-Null
        Add-Arrow $page $x[0] 4.76 $x[0] 2.74 | Out-Null
        Add-Arrow $page $x[1] 4.76 $x[1] 2.74 | Out-Null
        Add-Arrow $page $x[2] 4.76 $x[2] 2.74 | Out-Null
        Add-Arrow $page $x[3] 4.76 $x[3] 2.74 | Out-Null

        # Main cross-layer calls stay in aligned columns; the context return is a separate column.
        Add-Arrow $page $x[1] 7.59 $x[1] 5.54 | Out-Null
        Add-Line $page ($x[2] + 1.30) 5.54 ($x[2] + 1.30) 5.72 $false 'RGB(89,89,89)' 0.9 | Out-Null
        Add-Line $page ($x[2] + 1.30) 5.72 14.60 5.72 $false 'RGB(89,89,89)' 0.9 | Out-Null
        Add-Line $page 14.60 5.72 14.60 7.95 $false 'RGB(89,89,89)' 0.9 | Out-Null
        Add-Arrow $page 14.60 7.95 10.90 7.95 $false $false 'RGB(89,89,89)' 0.9 | Out-Null
        Add-Text $page 13.30 6.35 1.35 0.18 '任务上下文' 7.0 $false | Out-Null

        Save-Figure $document $page '图4-1-wpw系统三层架构'
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page)
        $document.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
}

function Draw-Figure42 {
    param($Visio)
    $parts = New-FigureDocument $Visio 15.6 9.2
    $document = $parts[0]; $page = $parts[1]
    try {
        # The figure uses three aligned columns. Every dependency is horizontal or vertical;
        # no relation line crosses another column or enters a node body.
        Add-Box $page 8.00 8.62 3.90 0.68 "阶段命令与 AI 编排" 10.8 $true | Out-Null
        Add-Frame $page 8.00 5.20 13.60 4.05 | Out-Null
        Add-Box $page 2.05 7.56 2.20 0.34 '工作流引擎' 9.2 $true 'RGB(255,255,255)' 'RGB(255,255,255)' 'RGB(89,89,89)' '0' | Out-Null

        # Top service row: Schema -> dependency check -> state service.
        Add-Box $page 4.00 6.70 2.75 0.86 "Schema 注册表`n阶段与依赖规则" 9.3 $false | Out-Null
        Add-Box $page 8.00 6.70 2.85 0.86 "依赖检查引擎`ncanProceed / warnings" 9.1 $false | Out-Null
        Add-Box $page 12.00 6.70 2.75 0.86 "状态服务`n完成、跳过、决策" 9.3 $false | Out-Null
        Add-Arrow $page 5.38 6.70 6.58 6.70 | Out-Null
        Add-Arrow $page 9.43 6.70 10.63 6.70 | Out-Null

        # The orchestration entry fans into the three columns through one horizontal bus.
        Add-Line $page 4.00 8.28 12.00 8.28 | Out-Null
        Add-Arrow $page 4.00 8.28 4.00 7.13 | Out-Null
        Add-Arrow $page 8.00 8.28 8.00 7.13 | Out-Null
        Add-Arrow $page 12.00 8.28 12.00 7.13 | Out-Null

        # Secondary services remain in their own columns.
        Add-Box $page 4.00 4.95 2.75 0.82 "模板与任务服务`n模板定位、Plan 解析" 9.2 $false | Out-Null
        Add-Box $page 12.00 4.95 2.75 0.82 "上下文调用适配`n锚点、参数、告警" 9.2 $false | Out-Null
        Add-Arrow $page 4.00 6.27 4.00 5.36 | Out-Null
        Add-Arrow $page 12.00 6.27 12.00 5.36 | Out-Null

        Add-Frame $page 8.00 1.82 13.60 1.70 | Out-Null
        Add-Box $page 2.05 2.55 1.75 0.34 '持久化制品' 9.2 $true 'RGB(255,255,255)' 'RGB(255,255,255)' 'RGB(89,89,89)' '0' | Out-Null
        Add-Box $page 4.00 1.82 3.05 0.82 "阶段文档 / Plan 任务`nBRD 至 Test / Markdown" 8.9 $false | Out-Null
        Add-Box $page 8.00 1.82 2.85 0.72 "状态快照`n.wpw.yaml" 9.0 $false | Out-Null
        Add-Box $page 12.00 1.82 2.85 0.72 "图谱上下文`n结构化结果" 9.0 $false | Out-Null
        Add-Arrow $page 4.00 4.54 4.00 2.18 | Out-Null
        Add-Arrow $page 8.00 6.27 8.00 2.18 | Out-Null
        Add-Arrow $page 12.00 4.54 12.00 2.18 | Out-Null

        Save-Figure $document $page '图4-2-工作流引擎实现架构'
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page)
        $document.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
}

function Draw-Figure43 {
    param($Visio)
    $parts = New-FigureDocument $Visio 15.6 10.2
    $document = $parts[0]; $page = $parts[1]
    try {
        $x = @(2.25, 5.85, 9.45, 13.05)
        $labels = @('开发者', 'AI 编程智能体', 'wpw CLI', '文件系统 / 图谱')
        for ($i = 0; $i -lt 4; $i++) {
            Add-Box $page $x[$i] 9.40 2.45 0.54 $labels[$i] 10 $true 'RGB(245,245,245)' | Out-Null
            $line = $page.DrawLine($x[$i], 0.65, $x[$i], 9.10)
            Set-CellValue $line 'LineColor' 'RGB(140,140,140)'
            Set-CellValue $line 'LinePattern' '2'
            Set-CellValue $line 'LineWeight' '0.7 pt'
        }

        Add-Arrow $page $x[0] 8.52 $x[1] 8.52 | Out-Null
        Add-Text $page 4.05 8.80 1.65 0.20 '提出需求' 7.5 $false | Out-Null
        Add-Arrow $page $x[1] 7.77 $x[2] 7.77 | Out-Null
        Add-Text $page 7.65 8.05 1.70 0.20 'wpw new' 7.5 $false | Out-Null
        Add-Arrow $page $x[2] 7.08 $x[3] 7.08 | Out-Null
        Add-Text $page 11.25 7.36 2.30 0.20 '创建工作区与状态快照' 7.2 $false | Out-Null

        Add-Arrow $page $x[1] 6.24 $x[2] 6.24 | Out-Null
        Add-Text $page 7.65 6.52 2.10 0.20 'check / template' 7.5 $false | Out-Null
        Add-Arrow $page $x[2] 5.72 $x[1] 5.72 | Out-Null
        Add-Text $page 7.65 5.43 2.30 0.20 '门禁结果与模板路径' 7.2 $false | Out-Null
        Add-Arrow $page $x[1] 4.95 $x[0] 4.95 | Out-Null
        Add-Text $page 4.05 5.23 1.75 0.20 '生成阶段大纲' 7.5 $false | Out-Null
        Add-Arrow $page $x[0] 4.38 $x[1] 4.38 | Out-Null
        Add-Text $page 4.05 4.10 1.75 0.20 '确认大纲' 7.5 $false | Out-Null
        Add-Arrow $page $x[1] 3.60 $x[3] 3.60 | Out-Null
        Add-Text $page 9.45 3.88 2.45 0.20 '保存阶段制品' 7.5 $false | Out-Null
        Add-Arrow $page $x[1] 3.00 $x[2] 3.00 | Out-Null
        Add-Text $page 7.65 2.72 1.55 0.20 'done / skip' 7.5 $false | Out-Null
        Add-Arrow $page $x[2] 2.50 $x[3] 2.50 | Out-Null
        Add-Text $page 11.25 2.78 2.05 0.20 '写入状态与任务进度' 7.2 $false | Out-Null

        Add-Text $page 1.20 6.60 1.10 0.22 '准备' 8.5 $true | Out-Null
        Add-Text $page 1.20 4.65 1.10 0.22 '生成确认' 8.5 $true | Out-Null
        Add-Text $page 1.20 2.78 1.10 0.22 '收尾' 8.5 $true | Out-Null
        $sep1 = $page.DrawLine(0.70, 5.38, 14.75, 5.38)
        $sep2 = $page.DrawLine(0.70, 3.22, 14.75, 3.22)
        foreach ($sep in @($sep1, $sep2)) {
            Set-CellValue $sep 'LineColor' 'RGB(160,160,160)'
            Set-CellValue $sep 'LinePattern' '2'
            Set-CellValue $sep 'LineWeight' '0.7 pt'
        }

        Add-Box $page 4.10 1.35 2.80 0.50 "Explore：方案候选 → 开发者拍板 → decision" 8.2 $false 'RGB(250,250,250)' 'RGB(120,120,120)' 'RGB(64,64,64)' '2' | Out-Null
        Add-Box $page 11.20 1.35 3.55 0.50 "Apply：领取 Plan 任务 → 请求上下文 → 更新任务状态" 8.2 $false 'RGB(250,250,250)' 'RGB(120,120,120)' 'RGB(64,64,64)' '2' | Out-Null

        Save-Figure $document $page '图4-3-阶段制品生成与确认流程'
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page)
        $document.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
}

function Draw-Figure44 {
    param($Visio)
    $parts = New-FigureDocument $Visio 15.6 8.3
    $document = $parts[0]; $page = $parts[1]
    try {
        $mainX = @(2.10, 4.65, 7.20, 9.75, 12.30)
        $mainText = @("BRD`n业务需求", "PRD`n产品需求", "Design`n技术设计", "Plan`n开发计划", "Apply`n编码实施")
        for ($i = 0; $i -lt 5; $i++) {
            Add-Box $page $mainX[$i] 4.32 1.72 0.84 $mainText[$i] 10.5 ($i -eq 4) | Out-Null
        }
        for ($i = 0; $i -lt 4; $i++) {
            Add-Arrow $page ($mainX[$i] + 0.86) 4.32 ($mainX[$i + 1] - 0.86) 4.32 | Out-Null
        }
        Add-Text $page 7.20 5.04 9.80 0.22 '实线：强依赖门禁（前置阶段必须为 done）' 8.0 $false | Out-Null

        Add-Box $page 5.30 6.65 1.75 0.66 "Explore`n可选探索" 9.5 $false 'RGB(250,250,250)' 'RGB(90,90,90)' 'RGB(51,51,51)' '2' | Out-Null
        Add-Diamond $page 7.20 6.65 1.55 0.98 "已拍板？"
        Add-Box $page 8.90 6.65 1.70 0.58 "忽略探索结果" 8.5 $false 'RGB(250,250,250)' 'RGB(120,120,120)' 'RGB(64,64,64)' '2' | Out-Null
        Add-Arrow $page 4.65 4.74 5.30 6.32 $true $false 'RGB(90,90,90)' 0.85 | Out-Null
        Add-Arrow $page 6.18 6.65 6.42 6.65 $true $false 'RGB(90,90,90)' 0.85 | Out-Null
        Add-Arrow $page 7.98 6.65 8.05 6.65 $true $false 'RGB(90,90,90)' 0.85 | Out-Null
        Add-Arrow $page 7.20 6.16 7.20 4.74 $true $false 'RGB(90,90,90)' 0.85 | Out-Null
        Add-Arrow $page 9.75 6.36 7.20 4.74 $true $false 'RGB(120,120,120)' 0.85 | Out-Null
        Add-Text $page 7.62 5.45 0.50 0.18 '是' 7.5 $false | Out-Null
        Add-Text $page 8.52 7.02 0.50 0.18 '否' 7.5 $false | Out-Null

        Add-Box $page 8.48 2.10 1.72 0.74 "Test`n测试方案" 10 $false 'RGB(250,250,250)' 'RGB(90,90,90)' 'RGB(51,51,51)' '2' | Out-Null
        Add-Arrow $page 7.20 3.90 8.05 2.47 | Out-Null
        Add-Arrow $page 9.75 3.90 8.91 2.47 | Out-Null
        Add-Arrow $page 9.34 2.10 11.44 3.90 $true $false 'RGB(90,90,90)' 0.85 | Out-Null
        Add-Text $page 10.55 2.76 1.60 0.18 '可选测试输入' 7.5 $false | Out-Null

        Add-Frame $page 13.20 6.53 3.35 1.22 | Out-Null
        Add-Text $page 13.20 7.12 2.55 0.18 '图例' 8.5 $true | Out-Null
        Add-Arrow $page 12.05 6.62 12.65 6.62 | Out-Null
        Add-Text $page 13.62 6.62 1.90 0.18 '强依赖' 7.4 $false 'RGB(64,64,64)' '0' | Out-Null
        Add-Arrow $page 12.05 6.16 12.65 6.16 $true $false 'RGB(100,100,100)' 0.8 | Out-Null
        Add-Text $page 13.62 6.16 1.90 0.18 '可选输入' 7.4 $false 'RGB(64,64,64)' '0' | Out-Null
        Add-Text $page 13.20 5.68 2.85 0.18 '菱形：开发者决策' 7.4 $false | Out-Null

        Add-Text $page 7.20 0.72 10.80 0.22 'Apply 的唯一硬前置为 Plan；Test 未完成时仅返回质量风险提示。' 8.0 $false | Out-Null
        Save-Figure $document $page '图4-4-DAG驱动的阶段门禁'
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page)
        $document.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
}

function Draw-Figure45 {
    param($Visio)
    $parts = New-FigureDocument $Visio 15.6 7.8
    $document = $parts[0]; $page = $parts[1]
    try {
        Add-Box $page 1.80 4.00 2.25 0.78 "任务与锚点`nC / L1 / L2 / L3" 9.8 $false | Out-Null
        Add-Box $page 4.55 4.00 2.65 0.92 "多锚点加权 BFS`n每个锚点双向扩展`n仅遍历 w >= 阈值" 9.3 $true | Out-Null

        Add-Text $page 8.00 6.35 2.40 0.22 '入边：上游依赖' 8.6 $true | Out-Null
        Add-Text $page 8.00 1.65 2.40 0.22 '出边：下游依赖' 8.6 $true | Out-Null
        Add-Box $page 7.20 5.35 2.10 0.74 "C / L1 节点`n能力与模块" 9.4 $false | Out-Null
        Add-Box $page 9.80 5.35 2.10 0.74 "上游文件`n与调用者" 9.4 $false | Out-Null
        Add-Box $page 7.20 2.65 2.10 0.74 "L2 / L3 节点`n文件与元素" 9.4 $false | Out-Null
        Add-Box $page 9.80 2.65 2.10 0.74 "下游文件`n与被调用者" 9.4 $false | Out-Null

        Add-Box $page 13.10 4.00 2.30 0.92 "合并与最小距离`n多锚点取 min(dist)`n保留节点及关系边" 9.2 $true | Out-Null

        Add-Arrow $page 2.93 4.00 3.23 4.00 | Out-Null
        Add-Arrow $page 5.88 4.46 6.15 5.35 | Out-Null
        Add-Arrow $page 5.88 3.54 6.15 2.65 | Out-Null
        Add-Arrow $page 8.25 5.35 8.75 5.35 | Out-Null
        Add-Arrow $page 10.85 5.35 11.95 4.46 | Out-Null
        Add-Arrow $page 8.25 2.65 8.75 2.65 | Out-Null
        Add-Arrow $page 10.85 2.65 11.95 3.54 | Out-Null

        Add-Text $page 11.40 5.86 1.00 0.18 '结构距离' 7.5 $false | Out-Null
        Add-Text $page 11.40 2.14 1.00 0.18 '结构距离' 7.5 $false | Out-Null
        Add-Text $page 7.80 4.85 1.10 0.18 '入边' 7.3 $false | Out-Null
        Add-Text $page 7.80 3.15 1.10 0.18 '出边' 7.3 $false | Out-Null

        Save-Figure $document $page '图4-5-加权双向BFS子图扩展示意'
    }
    finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($page)
        $document.Close()
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($document)
    }
}

$visio = $null
try {
    $visio = New-Object -ComObject Visio.Application
    $visio.Visible = $false
    $visio.AlertResponse = 7
    Draw-Figure41 $visio
    Draw-Figure42 $visio
    Draw-Figure43 $visio
    Draw-Figure44 $visio
    Draw-Figure45 $visio
}
finally {
    if ($visio -ne $null) {
        try { $visio.Quit() } catch {}
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($visio)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
