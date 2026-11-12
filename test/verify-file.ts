import { readFileSync } from "fs";
import { parseDoc, serializeDoc, hasMindmapMark } from "../src/mdTree";

const p = process.argv[2];
const text = readFileSync(p, "utf8");
const d = parseDoc(text, "x");
console.log("mark recognised:", hasMindmapMark(text), "| virtualRoot:", d.virtualRoot, "| root:", d.root.data.text);
let n = 0;
const walk = (nd: any, depth: number) => {
  n++;
  if (depth <= 2) console.log("  ".repeat(depth) + "- " + nd.data.text + (nd.children.length ? ` (${nd.children.length})` : ""));
  nd.children.forEach((c: any) => walk(c, depth + 1));
};
walk(d.root, 0);
console.log("total nodes:", n);
const out = serializeDoc({ root: d.root, virtualRoot: d.virtualRoot, useTab: d.useTab, eol: d.eol, fmInner: d.fmInner, fmUpdates: { cloudmind: "true" } });
console.log("roundtrip identical:", out === text);
if (out !== text) {
  const a = out.split("\n"), b = text.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { console.log("first diff line", i + 1, JSON.stringify(b[i]), "=>", JSON.stringify(a[i])); break; }
}
