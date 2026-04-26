import fs from "fs"
import yaml from "js-yaml"
import Ajv from "ajv"

const ajv = new Ajv()

function loadYaml(path: string) {
  const raw = fs.readFileSync(path, "utf8")
  return yaml.load(raw)
}

function validate(schema: any, data: any) {
  const validateFn = ajv.compile(schema)
  if (!validateFn(data)) {
    throw new Error(JSON.stringify(validateFn.errors, null, 2))
  }
  return data
}

export function loadConfig() {
  const global = loadYaml("./config/global.yaml")
  const profiles = loadYaml("./config/profiles.yaml")
  const agents = loadYaml("./config/agents.yaml")
  const routing = loadYaml("./config/routing.yaml")

  return {
    global,
    profiles,
    agents,
    routing
  }
}