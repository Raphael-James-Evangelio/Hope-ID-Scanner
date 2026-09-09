const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const seedPath = path.join(projectRoot, 'seed', 'hope-scanner.db')

function findLiveDb() {
  const candidates = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'hope-id-scanner', 'hope-scanner.db'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'HOPE ID Scanner', 'hope-scanner.db')
  ].filter(Boolean)
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

const livePath = findLiveDb()

if (!livePath) {
  console.error('Could not find the live student database. Expected one of:')
  console.error('  %APPDATA%/hope-id-scanner/hope-scanner.db')
  process.exit(1)
}

fs.mkdirSync(path.join(projectRoot, 'seed'), { recursive: true })
fs.copyFileSync(livePath, seedPath)
console.log('Seed updated from:')
console.log('  ' + livePath)
console.log('  -> ' + seedPath)
console.log('The next installer build will carry the latest student roster.')
