$ErrorActionPreference = 'Stop'

$workspace = 'F:\project\web-project-workflow'
$outputDir = Join-Path $workspace '论文\图表'
$vsdxPath = Join-Path $outputDir '图3-2-六阶段流程约束架构.vsdx'
$pngPath  = Join-Path $outputDir '图3-2-六阶段流程约束架构.png'

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

function Add-Diamond {
    param(
        [Parameter(Mandatory = $true)] $Page,
        [double] $X,
        [double] $Y,
        [double] $Width,
        [double] $Height,
        [Parameter(Mandatory = $true)] [string] $Text,
        [double] $FontSize = 8.5,
        [string] $Line = 'RGB(64,64,64)'
    )
    $shape = $Page.DrawLine($X - $Width / 2, $Y, $X, $Y - $Height / 2)
    $shape.Text = ''
    Set-CellValue $shape 'LineColor' $Line
    Set-CellValue $shape 'LineWeight' '0.9 pt'
    Set-CellValue $shape 'EndArrow' '0'
    # Draw four lines of a diamond as a group -- use polyline instead
    # Actually just use a rotated rectangle shape via the shape type approach is overkill;
    # We'll use a separate approach: draw a rectangle and set rotation
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

    Set-CellValue $page.PageSheet 'PageWidth'  '13 in'
    Set-CellValue $page.PageSheet 'PageHeight' '10.5 in'

    $ink    = 'RGB(64,64,64)'
    $muted  = 'RGB(89,89,89)'
    $accent = 'RGB(44,62,80)'  # 低饱和强调色，仅用于归档反馈

    # ---------- 标题 ----------
    Add-TextBox $page 6.5 9.90 12.0 0.35 '六阶段流程约束架构与三段式编排契约' 11 $true $ink '1' | Out-Null

    # ---------- 阶段配置 ----------
    $stages = @(
        @{ name = 'BRD';     cn = '业务需求';   artifact = '业务需求文档';   optional = $false; gate = $false },
        @{ name = 'PRD';     cn = '产品需求';   artifact = '产品需求文档';   optional = $false; gate = $false },
        @{ name = 'Explore'; cn = '技术探索';   artifact = '探索报告';       optional = $true;  gate = $true  },
        @{ name = 'Design';  cn = '技术设计';   artifact = '技术设计文档';   optional = $false; gate = $false },
        @{ name = 'Plan';    cn = '开发计划';   artifact = '任务分解计划';   optional = $false; gate = $false },
        @{ name = 'Test';    cn = '测试方案';   artifact = '测试方案文档';   optional = $false; gate = $false },
        @{ name = 'Apply';   cn = '编码实施';   artifact = '代码变更';       optional = $false; gate = $false }
    )

    $n = $stages.Count
    $stageW = 1.70           # 每个阶段主框宽度
    $stageH = 1.15           # 阶段主框高度（含阶段名+制品）
    $contractH = 1.05        # 三段式契约块高度
    $gateW = 1.50            # 拍板门禁菱形宽度（占用 Explore 的上下占位）
    $gap = 0.15              # 阶段间间距
    $totalW = $n * $stageW + ($n - 1) * $gap
    $startX = 6.5 - $totalW / 2 + $stageW / 2

    $stageY = 7.35           # 阶段主框中心 y
    $contractY = $stageY - $stageH / 2 - $contractH / 2 - 0.35  # 三段式契约 y（在阶段框下方）

    # 画每阶段：阶段主框（上）+ 三段式契约小框（下）+ 之间箭头
    for ($i = 0; $i -lt $n; $i++) {
        $s = $stages[$i]
        $x = $startX + $i * ($stageW + $gap)

        # 阶段主框（阶段中文名 + 制品）
        $box = Add-Box $page $x $stageY $stageW $stageH "$($s.cn)`n（$($s.artifact)）" $null $ink 8.5 $true $ink

        # 可选标记（在框内右上角）
        if ($s.optional) {
            Add-TextBox $page ($x + $stageW/2 - 0.55) ($stageY + $stageH/2 - 0.18) 0.55 0.22 '可选' 6.5 $true $muted '2' | Out-Null
        }

        if ($i -eq 0) {
            # BRD 下方画完整三段式契约作为样例
            $subGap = 0.02
            $subW = ($stageW - 2 * $subGap) / 3
            $subH = $contractH
            $subY = $contractY
            $labels = @('① 准备', '② 生成', '③ 收尾')
            $subs = @('CLI 准备', "AI 生成`n用户确认", 'CLI 收尾')
            for ($k = 0; $k -lt 3; $k++) {
                $sx = $x - $stageW/2 + $subGap + $subW/2 + $k * ($subW + $subGap)
                $box2 = Add-Box $page $sx $subY $subW $subH "$($subs[$k])" $null $ink 6 $false $ink
                Add-TextBox $page $sx ($subY + $subH/2 + 0.03) $subW 0.16 $labels[$k] 6.5 $true $muted '1' | Out-Null
            }
            # 阶段主框 -> 契约 连接线
            Add-Arrow $page $x ($stageY - $stageH/2) $x ($subY + $subH/2 + 0.05) $muted 0.7 | Out-Null
            # 样例标注
            Add-TextBox $page ($x - $stageW/2 - 0.05) ($contractY - $contractH/2 - 0.05) 0.7 0.20 '样例' 7 $true $muted '0' | Out-Null
        } else {
            # 其他阶段下方画小圆点 + 短竖线，表示"同样遵循三段式契约"
            $dotY = $contractY
            $dot = $page.DrawOval($x - 0.06, $dotY - 0.06, $x + 0.06, $dotY + 0.06)
            Set-CellValue $dot 'FillForegnd' $muted
            Set-CellValue $dot 'FillPattern' '1'
            Set-CellValue $dot 'LineColor' $muted
            Set-CellValue $dot 'LineWeight' '0.7 pt'
            # 竖线连接阶段主框底部到圆点
            $line = $page.DrawLine($x, ($stageY - $stageH/2), $x, ($dotY + 0.06))
            Set-CellValue $line 'LineColor' $muted
            Set-CellValue $line 'LineWeight' '0.7 pt'
        }
    }

# 阶段之间的箭头（横向）
    for ($i = 0; $i -lt $n - 1; $i++) {
        $x1 = $startX + $i * ($stageW + $gap) + $stageW / 2
        $x2 = $startX + ($i + 1) * ($stageW + $gap) - $stageW / 2
        Add-Arrow $page $x1 $stageY $x2 $stageY $ink 1.0 | Out-Null
    }

    # 拍板门禁：在 Explore 上方加一个菱形标注
    $exploreX = $startX + 2 * ($stageW + $gap)
    $gateTopY = $stageY + $stageH/2 + 0.40
    # 用文字 + 上/下箭头表示门禁（菱形实现复杂，改用粗体文字框）
    $gateBox = Add-Box $page $exploreX $gateTopY 1.50 0.48 '拍板门禁' 'RGB(245,245,245)' $accent 9 $true $accent
    # 连接上下
    Add-Arrow $page $exploreX ($gateTopY - 0.24) $exploreX ($stageY + $stageH/2 + 0.05) $accent 0.9 | Out-Null

    # ---------- 三段式契约统一说明带 ----------
    $noteY = $contractY - $contractH/2 - 0.55
    Add-TextBox $page 6.5 $noteY 11.0 0.30 '所有阶段均遵循三段式编排契约：① CLI 准备　② AI 生成与用户确认　③ CLI 收尾' 8 $true $ink '1' | Out-Null

    # ---------- 归档与反馈弧 ----------
    $archiveX = $startX + ($n - 1) * ($stageW + $gap) + $stageW/2 + 0.95
    $archiveY = $stageY
    Add-Box $page $archiveX $archiveY 1.65 1.05 "需求归档`n过程知识`n→稳态知识" $null $accent 9 $true $accent
    Add-Arrow $page ($startX + ($n - 1) * ($stageW + $gap) + $stageW/2) $stageY ($archiveX - 0.65) $stageY $accent 1.0 | Out-Null

    # 下方反馈弧：归档 -> 知识沉淀 -> 回流到 BRD/能力规范
    $feedbackY = $contractY - $contractH/2 - 2.10
    $feedbackXLeft  = $startX - $stageW/2 - 0.00
    $feedbackXRight = $archiveX + 0.77

    # 画大 U 形反馈弧（三段：右垂直线 + 底线 + 左垂直线）
    $downR = $page.DrawLine($feedbackXRight, ($contractY - $contractH/2 - 0.1), $feedbackXRight, $feedbackY)
    Set-CellValue $downR 'LineColor' $accent
    Set-CellValue $downR 'LineWeight' '1.1 pt'
    Set-CellValue $downR 'LinePattern' '2'  # 虚线

    $bottomLine = $page.DrawLine($feedbackXRight, $feedbackY, $feedbackXLeft, $feedbackY)
    Set-CellValue $bottomLine 'LineColor' $accent
    Set-CellValue $bottomLine 'LineWeight' '1.1 pt'
    Set-CellValue $bottomLine 'LinePattern' '2'

    $upL = $page.DrawLine($feedbackXLeft, $feedbackY, $feedbackXLeft, ($stageY - 0.05))
    Set-CellValue $upL 'LineColor' $accent
    Set-CellValue $upL 'LineWeight' '1.1 pt'
    Set-CellValue $upL 'LinePattern' '2'
    $inL = $page.DrawLine(($feedbackXLeft - 0.0), $stageY, ($startX - $stageW/2 + 0.02), $stageY)
    Set-CellValue $inL 'LineColor' $accent
    Set-CellValue $inL 'LineWeight' '1.1 pt'
    Set-CellValue $inL 'EndArrow' '4'

    # 反馈弧中间说明
    Add-TextBox $page 6.5 ($feedbackY + 0.22) 4.0 0.28 '知识沉淀与增量更新（归档触发）' 8.5 $true $accent '1' | Out-Null

    # ---------- 底部说明框：四条设计原则 ----------
    $princY = $feedbackY - 0.80
    Add-Frame $page 6.5 $princY 11.6 0.95 | Out-Null
    Add-TextBox $page 6.5 ($princY + 0.38) 11.0 0.22 '流程约束四条设计原则' 9 $true $ink '1' | Out-Null
    $princText = '状态确定性（状态变更必经 CLI）　·　权限边界（AI 不直接改状态文件）　·　人机协同（拍板由人执行）　·　可恢复性（断点续作与降级容错）'
    Add-TextBox $page 6.5 ($princY - 0.14) 11.0 0.30 $princText 8 $false $muted '1' | Out-Null

    # 保存与导出
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
