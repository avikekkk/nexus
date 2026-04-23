import type { DbType } from "../../db/types.ts"

interface DbTypeItem {
  name: string
  value: DbType
}

export function wrapDbTypeRows(types: DbTypeItem[], maxWidth: number): DbTypeItem[][] {
  const rows: DbTypeItem[][] = []
  let currentRow: DbTypeItem[] = []
  let currentWidth = 0

  for (const type of types) {
    const pillWidth = type.name.length + 2
    const nextWidth = currentRow.length === 0 ? pillWidth : currentWidth + 1 + pillWidth

    if (currentRow.length > 0 && nextWidth > maxWidth) {
      rows.push(currentRow)
      currentRow = [type]
      currentWidth = pillWidth
      continue
    }

    currentRow.push(type)
    currentWidth = nextWidth
  }

  if (currentRow.length > 0) {
    rows.push(currentRow)
  }

  return rows
}
