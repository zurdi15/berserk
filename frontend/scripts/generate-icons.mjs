import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public', 'icons')

const sizes = [
  { name: 'pwa-192.png', size: 192 },
  { name: 'pwa-512.png', size: 512 },
  { name: 'maskable-512.png', size: 512 },
]

async function generateIcons() {
  for (const { name, size } of sizes) {
    const outputPath = path.join(publicDir, name)
    const svgPath = path.join(publicDir, name.includes('maskable') ? 'berserk-maskable.svg' : 'berserk.svg')

    try {
      await sharp(svgPath)
        .resize(size, size, { fit: 'contain', background: { r: 10, g: 12, b: 15, alpha: 1 } })
        .png()
        .toFile(outputPath)
      console.log(`✓ Generated ${name} (${size}x${size})`)
    } catch (error) {
      console.error(`✗ Failed to generate ${name}:`, error.message)
    }
  }
}

generateIcons()
