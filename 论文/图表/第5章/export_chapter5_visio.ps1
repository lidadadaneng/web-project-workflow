param(
    [Parameter(Mandatory=$true)][string]$GeometryPath,
    [string]$OutputDir = $PSScriptRoot
)
$ErrorActionPreference = 'Stop'
$outputDir = $OutputDir
$figures = Get-Content -Raw -Encoding UTF8 -LiteralPath $GeometryPath | ConvertFrom-Json

function Cell($shape, [string]$name, [string]$formula) {
    $shape.CellsU($name).FormulaU = $formula
}
function Color([string]$hex) {
    if ($hex -eq 'none') { return 'RGB(255,255,255)' }
    $hex = $hex.TrimStart('#')
    if ($hex.Length -eq 3) {
        $hex = -join ($hex.ToCharArray() | ForEach-Object { "$_$_" })
    }
    return ('RGB({0},{1},{2})' -f [Convert]::ToInt32($hex.Substring(0,2),16),[Convert]::ToInt32($hex.Substring(2,2),16),[Convert]::ToInt32($hex.Substring(4,2),16))
}
function Release($obj) {
    if($null -ne $obj -and [Runtime.InteropServices.Marshal]::IsComObject($obj)) {
        [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj)
    }
}

$visio=$null
try {
    $visio=New-Object -ComObject Visio.Application
    $visio.Visible=$false
    $visio.AlertResponse=7
    foreach($fig in $figures) {
        $document=$null; $page=$null; $sheet=$null; $shape=$null
        try {
            $document=$visio.Documents.Add('')
            $page=$document.Pages.Item(1)
            $sheet=$page.PageSheet
            Cell $sheet 'PageWidth' ('{0} in' -f ($fig.w/100))
            Cell $sheet 'PageHeight' ('{0} in' -f ($fig.h/100))
            Release $sheet; $sheet=$null
            foreach($s in $fig.shapes) {
                if($s.kind -eq 'rect') {
                    $shape=$page.DrawRectangle($s.x/100,($fig.h-$s.y-$s.h)/100,($s.x+$s.w)/100,($fig.h-$s.y)/100)
                    Cell $shape 'FillPattern' $(if($s.fill -eq 'none'){'0'}else{'1'})
                    Cell $shape 'FillForegnd' (Color $s.fill)
                    Cell $shape 'LineColor' (Color $s.stroke)
                    Cell $shape 'LineWeight' '1.44 pt'
                    Cell $shape 'LinePattern' $(if($s.dashed){'2'}else{'1'})
                    Release $shape; $shape=$null
                }
                elseif($s.kind -eq 'text') {
                    $left=$s.x-$s.w/2
                    if($s.anchor -eq 'start'){$left=$s.x}
                    if($s.anchor -eq 'end'){$left=$s.x-$s.w}
                    $shape=$page.DrawRectangle($left/100,($fig.h-$s.y-$s.h/2)/100,($left+$s.w)/100,($fig.h-$s.y+$s.h/2)/100)
                    Cell $shape 'LinePattern' '0'
                    Cell $shape 'FillPattern' $(if($s.white){'1'}else{'0'})
                    Cell $shape 'FillForegnd' 'RGB(255,255,255)'
                    $shape.Text=$s.lines -join "`n"
                    Cell $shape 'Char.Font' 'FONT("Microsoft YaHei")'
                    Cell $shape 'Char.Size' ('{0} pt' -f ($s.size*0.72))
                    Cell $shape 'Char.Color' 'RGB(48,56,64)'
                    Cell $shape 'Para.HorzAlign' $(if($s.anchor -eq 'start'){'0'}elseif($s.anchor -eq 'end'){'2'}else{'1'})
                    Cell $shape 'VerticalAlign' '1'
                    foreach($margin in @('LeftMargin','RightMargin','TopMargin','BottomMargin')) { Cell $shape $margin '0 in' }
                    Release $shape; $shape=$null
                }
                elseif($s.kind -eq 'path') {
                    for($i=0;$i -lt $s.points.Count-1;$i++) {
                        $a=$s.points[$i];$b=$s.points[$i+1]
                        $shape=$page.DrawLine($a[0]/100,($fig.h-$a[1])/100,$b[0]/100,($fig.h-$b[1])/100)
                        Cell $shape 'LineColor' (Color $s.stroke)
                        Cell $shape 'LineWeight' '1.44 pt'
                        Cell $shape 'LinePattern' $(if($s.dashed){'2'}else{'1'})
                        if($s.arrow -and $i -eq $s.points.Count-2){ Cell $shape 'EndArrow' $(if($s.open){'2'}else{'4'}); Cell $shape 'EndArrowSize' '2' }
                        if($s.startArrow -and $i -eq 0){ Cell $shape 'BeginArrow' '4'; Cell $shape 'BeginArrowSize' '2' }
                        Release $shape; $shape=$null
                    }
                }
            }
            $document.SaveAs((Join-Path $outputDir ($fig.base+'.vsdx')))
            Write-Output ('Visio: '+$fig.base)
        }
        finally {
            Release $shape; Release $sheet; Release $page
            if($null -ne $document){$document.Close();Release $document}
        }
    }

    # These four figures are explicitly retained without redrawing in the chapter.
    $renames=@(
        @('图5-2-工作流引擎实现架构','图5-3-工作流引擎实现架构'),
        @('图5-3-阶段制品生成与确认流程','图5-4-阶段制品生成与确认流程'),
        @('图5-4-DAG驱动的阶段门禁','图5-6-DAG驱动的阶段门禁'),
        @('图5-5-加权双向BFS子图扩展示意','图5-7-加权双向BFS子图扩展示意')
    )
    foreach($mapping in $renames) {
        foreach($ext in @('.png','.vsdx')) {
            $source=Join-Path $outputDir ($mapping[0]+$ext)
            $target=Join-Path $outputDir ($mapping[1]+$ext)
            if(Test-Path -LiteralPath $source) {
                if(Test-Path -LiteralPath $target){throw ('Target already exists: '+$target)}
                Move-Item -LiteralPath $source -Destination $target
            }
        }
        if(-not (Test-Path -LiteralPath (Join-Path $outputDir ($mapping[1]+'.vsdx')))) {
            throw ('Missing retained Visio source: '+$mapping[1])
        }
        Write-Output ('Retained and renumbered: '+$mapping[1])
    }
}
finally {
    if($null -ne $visio){try{$visio.Quit()}catch{};Release $visio}
    [GC]::Collect();[GC]::WaitForPendingFinalizers()
}
