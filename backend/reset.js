import fs from "node:fs";
import path from "node:path";

const dataPath = path.join(process.cwd(), "data.json");
const defaultsPath = path.join(process.cwd(), "data.defaults.json");

const defaults = fs.readFileSync(defaultsPath, "utf-8");
fs.writeFileSync(dataPath, defaults);
console.log("Banco local resetado para o estado inicial.");
