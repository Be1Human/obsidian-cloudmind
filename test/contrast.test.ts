import { contrastRatio, parseColor, readableTextOn } from "../src/contrast";

let failed = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(cond ? "PASS" : "FAIL", name, cond ? "" : extra);
  if (!cond) failed++;
};

check("parse #rrggbb", JSON.stringify(parseColor("#FFE9A8")) === "[255,233,168]");
check("parse #rgb", JSON.stringify(parseColor("#fff")) === "[255,255,255]");
check("parse rgb()", JSON.stringify(parseColor("rgb(10, 20, 30)")) === "[10,20,30]");
check("parse rgba() opaque", JSON.stringify(parseColor("rgba(10,20,30,0.9)")) === "[10,20,30]");
check("transparent / none / nearly transparent ignored", parseColor("transparent") === null && parseColor("none") === null && parseColor("rgba(0,0,0,0.1)") === null);
check("garbage ignored", parseColor("banana") === null && parseColor(undefined) === null && parseColor(42) === null);
check("black on white = 21:1", Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01);

// 深色主题里的白字落在浅黄填充上：必须换成深色字
check("white text on pale yellow -> dark", readableTextOn("#FFE9A8", "#C9D1D9") === "#1F2937");
check("white text on pale blue -> dark", readableTextOn("#D3E2FF", "#FFFFFF") === "#1F2937");
// 浅色主题里的深色字落在深色填充上：必须换成白字
check("dark text on navy -> white", readableTextOn("#2F3B52", "#1F2937") === "#FFFFFF");
check("dark text on dark red -> white", readableTextOn("#8B0000", "#374151") === "#FFFFFF");
// 已经够清楚就不动
check("dark text on pale yellow unchanged", readableTextOn("#FFE9A8", "#1F2937") === null);
check("white text on navy unchanged", readableTextOn("#2F3B52", "#FFFFFF") === null);
// 取不到颜色时不乱改
check("transparent fill -> no change", readableTextOn("transparent", "#FFFFFF") === null);
check("unknown current text colour still picks something readable", readableTextOn("#FFE9A8", "weird") === "#1F2937");
// 中等亮度的颜色：不论怎么选对比度都要 >= 3
for (const c of ["#E8684A", "#5B8FF9", "#5AD8A6", "#F6BD16", "#9270CA", "#FF9D4D", "#269A99"]) {
  const t = readableTextOn(c, "#888888");
  const fg = parseColor(t ?? "#888888")!;
  check(`mid-tone ${c}: chosen text contrast >= 3`, contrastRatio(fg, parseColor(c)!) >= 3, `${t} ${contrastRatio(fg, parseColor(c)!).toFixed(2)}`);
}

console.log(failed === 0 ? "\nCONTRAST PASSED" : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
