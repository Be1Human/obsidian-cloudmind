import { readFileSync, writeFileSync } from "fs";
const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#fff;font-family:sans-serif}#host{width:1100px;height:720px;display:flex;flex-direction:column}#host>div{flex:1;display:flex;flex-direction:column;min-height:0;height:100%}:root{--background-secondary:#f3f3f3;--background-primary:#fff;--background-modifier-border:#ddd;--background-modifier-hover:#e6e6e6;--text-muted:#666;--text-normal:#222}${css}</style></head><body><div id="host"></div><script src="harness.js"></script></body></html>`;
writeFileSync(new URL("./harness.html", import.meta.url), html);
