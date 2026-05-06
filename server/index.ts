import { createProductionApp } from './app.js'
import { loadConfig } from './config.js'

const config = loadConfig(process.env)
const app = createProductionApp(config.databaseUrl, config.staticDir)

app.listen(config.port, () => {
  console.log(`session-viewer server listening on ${config.port}`)
})
