const { execFile } = require('node:child_process')
const path = require('node:path')
const { promisify } = require('node:util')

const run = promisify(execFile)

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath])
}
