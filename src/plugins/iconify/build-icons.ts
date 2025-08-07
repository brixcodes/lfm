import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)

import { cleanupSVG, importDirectory, isEmptyColor, parseColors, runSVGO } from '@iconify/tools'
import type { IconifyJSON } from '@iconify/types'
import { getIcons, getIconsCSS, stringToIcon } from '@iconify/utils'

interface BundleScriptCustomSVGConfig {
  dir: string
  monotone: boolean
  prefix: string
}

interface BundleScriptCustomJSONConfig {
  filename: string
  icons?: string[]
}

interface BundleScriptConfig {
  svg?: BundleScriptCustomSVGConfig[]
  icons?: string[]
  json?: (string | BundleScriptCustomJSONConfig)[]
}

const sources: BundleScriptConfig = {
  svg: [],
  icons: [],
  json: [],
}

const target = join(dirname(fileURLToPath(import.meta.url)), 'icons.css')

;(async function () {
  const riJsonPath = require.resolve('@iconify-json/ri/icons.json')
  const bxlJsonPath = require.resolve('@iconify-json/bxl/icons.json')

  sources.json!.push(riJsonPath)
  sources.json!.push({
    filename: bxlJsonPath,
    icons: ['facebook', 'twitter', 'github', 'google', 'linkedin'],
  })

  const dir = dirname(target)
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {}

  const allIcons: IconifyJSON[] = []

  if (sources.icons && sources.icons.length > 0) {
    const sourcesJSON = sources.json ? sources.json : (sources.json = [])
    const organizedList = organizeIconsList(sources.icons)

    for (const prefix in organizedList) {
      const filename = require.resolve(`@iconify/json/json/${prefix}.json`)
      sourcesJSON.push({
        filename,
        icons: organizedList[prefix],
      })
    }
  }

  if (sources.json) {
    for (let i = 0; i < sources.json.length; i++) {
      const item = sources.json[i]
      const filename = typeof item === 'string' ? item : item.filename
      const content = JSON.parse(await fs.readFile(filename, 'utf8')) as IconifyJSON

      if (typeof item !== 'string' && item.icons?.length) {
        const filteredContent = getIcons(content, item.icons)
        if (!filteredContent) throw new Error(`Cannot find required icons in ${filename}`)
        allIcons.push(filteredContent)
      } else {
        allIcons.push(content)
      }
    }
  }

  if (sources.svg) {
    for (let i = 0; i < sources.svg.length; i++) {
      const source = sources.svg[i]
      const iconSet = await importDirectory(source.dir, {
        prefix: source.prefix,
      })

      await iconSet.forEach(async (name, type) => {
        if (type !== 'icon') return
        const svg = iconSet.toSVG(name)

        if (!svg) {
          iconSet.remove(name)
          return
        }

        try {
          await cleanupSVG(svg)

          if (source.monotone) {
            await parseColors(svg, {
              defaultColor: 'currentColor',
              callback: (attr, colorStr, color) => {
                return !color || isEmptyColor(color) ? colorStr : 'currentColor'
              },
            })
          }

          await runSVGO(svg)
        } catch (err) {
          console.error(`Error parsing ${name} from ${source.dir}:`, err)
          iconSet.remove(name)
          return
        }

        iconSet.fromSVG(name, svg)
      })

      allIcons.push(iconSet.export())
    }
  }

  const cssContent = allIcons
    .map(iconSet =>
      getIconsCSS(iconSet, Object.keys(iconSet.icons), {
        iconSelector: '.{prefix}-{name}',
      }),
    )
    .join('\n')

  await fs.writeFile(target, cssContent, 'utf8')
  console.log(`Saved CSS to ${target}!`)
})().catch(err => {
  console.error(err)
})

function organizeIconsList(icons: string[]): Record<string, string[]> {
  const sorted: Record<string, string[]> = Object.create(null)

  icons.forEach(icon => {
    const item = stringToIcon(icon)
    if (!item) return

    const prefix = item.prefix
    const prefixList = sorted[prefix] ? sorted[prefix] : (sorted[prefix] = [])
    const name = item.name
    if (!prefixList.includes(name)) prefixList.push(name)
  })

  return sorted
}
