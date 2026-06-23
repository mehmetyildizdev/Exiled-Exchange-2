import childProcess from 'child_process'
import electron from 'electron'
import esbuild from 'esbuild'

const isDev = !process.argv.includes('--prod')

if (isDev && process.platform === 'win32') {
  try {
    childProcess.execSync('powershell -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'electron.exe\'\\" | Where-Object { $_.CommandLine -like \'*exiled-exchange*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"', { stdio: 'ignore' })
  } catch {}
}

const electronRunner = (() => {
  let handle = null
  return {
    restart () {
      console.info('Restarting Electron process.')

      if (handle) {
        if (process.platform === 'win32') {
          try {
            childProcess.execSync(`taskkill /pid ${handle.pid} /t /f`, { stdio: 'ignore' })
          } catch {}
        } else {
          handle.kill()
        }
      }
      handle = childProcess.spawn(electron, ['.'], {
        stdio: 'inherit'
      })
    }
  }
})()

await esbuild.build({
  entryPoints: ['src/vision/link-worker.ts'],
  bundle: true,
  platform: 'node',
  outfile: 'dist/vision.js'
})

const mainContext = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: !isDev,
  platform: 'node',
  external: ['electron', 'uiohook-napi', 'electron-overlay-window'],
  outfile: 'dist/main.js',
  define: {
    'process.env.STATIC': (isDev) ? '"../build/icons"' : '"."',
    'process.env.VITE_DEV_SERVER_URL': (isDev) ? '"http://localhost:5173"' : 'null'
  },
  plugins: (isDev) ? [{
    name: 'electron-runner',
    setup (build) {
      build.onEnd((result) => {
        if (!result.errors.length) electronRunner.restart()
      })
    }
  }] : []
})

if (isDev) {
  await mainContext.watch()
} else {
  await mainContext.rebuild()
  mainContext.dispose()
}
