/** 图谱层级配色（全局统一，与 src/styles.css 的 CSS 变量保持一致） */
export const LEVEL_COLORS: Record<string, string> = {
  C: '#b37feb',
  L1: '#409eff',
  L2: '#67c23a',
  L3: '#e6a23c',
}

export const EDGE_STYLE: Record<string, { color: string; width: number; type?: 'dashed' }> = {
  contain: { color: '#c0c4cc', width: 1 },
  import: { color: '#79bbff', width: 1 },
  call: { color: '#eebe77', width: 1 },
  inherit: { color: '#95d475', width: 1 },
  business_map: { color: '#9c36b5', width: 2.5 },
}
