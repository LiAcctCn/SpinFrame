const { app, BrowserWindow } = require('electron')
const { writeFile } = require('node:fs/promises')
const path = require('node:path')

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    useContentSize: true,
    frame: false,
    transparent: true,
    webPreferences: { backgroundThrottling: false }
  })
  await window.loadFile(path.join(__dirname, '..', 'build', 'icon.svg'))
  const image = await window.webContents.capturePage()
  await writeFile(path.join(__dirname, '..', 'build', 'icon-1024.png'), image.toPNG())
  window.destroy()
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
