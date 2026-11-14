import { parseDoc, serializeDoc } from "../src/mdTree";

let failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) console.log("PASS", name);
  else {
    failed++;
    console.log("FAIL", name, extra ?? "");
  }
}

function rt(text: string, title = "T") {
  const d = parseDoc(text, title);
  return {
    d,
    out: serializeDoc({
      root: d.root,
      virtualRoot: d.virtualRoot,
      useTab: d.useTab,
      eol: d.eol,
      fmInner: d.fmInner,
      fmUpdates: { "cloudmind": "true" },
    }),
  };
}

// 1. 标准标题 + 列表混合，往返后应完全一致
const a = `---
cloudmind: true
---
# 中心
## 分支A
### 子A1
- 叶子1
  - 叶子1.1
- 叶子2
## 分支B
- x
`;
check("heading+list roundtrip identical", rt(a).out === a, "\n" + rt(a).out);

// 2. 元数据注释往返（折叠、样式、概要）
const b = `---
cloudmind: true
---
# 根
## A <!--mm:{"expand":false,"fillColor":"#ff0000"}-->
- a1
## B <!--mm:{"generalization":[{"text":"概要","range":[0,0]}]}-->
`;
const rb = rt(b);
check("meta expand=false parsed", rb.d.root.children[0].data.expand === false);
check("meta style parsed", rb.d.root.children[0].data.fillColor === "#ff0000");
check("meta roundtrip identical", rb.out === b, "\n" + rb.out);

// 3. 备注（普通文本行）和代码块
const c = `---
cloudmind: true
---
# 根
## A
这是备注第一行
第二行
- 项
  项备注
  \`\`\`js
  # not a heading
  \`\`\`
`;
const rc = rt(c);
check("note attached to heading", rc.d.root.children[0].data.note === "这是备注第一行\n第二行");
check("note attached to list item incl. fence", /# not a heading/.test(rc.d.root.children[0].children[0].data.note));
check("notes roundtrip identical", rc.out === c, "\n" + rc.out);

// 4. 多个一级标题 -> 虚拟根，保存时不生成根行
const d = `# A
## a1
# B
`;
const rd = rt(d, "文件名");
check("virtual root", rd.d.virtualRoot && rd.d.root.data.text === "文件名");
check("virtual roundtrip keeps top-level headings", rd.out === "---\ncloudmind: true\n---\n# A\n## a1\n# B\n", "\n" + rd.out);

// 5. 纯列表文档 -> 虚拟根
const e = `- a\n  - b\n- c\n`;
const re = rt(e, "列表");
check("list-only virtual root", re.d.virtualRoot && re.d.root.children.length === 2);
check("list-only roundtrip", re.out.endsWith("- a\n  - b\n- c\n"), "\n" + re.out);

// 6. tab 缩进保持
const f = `# R\n- a\n\t- b\n`;
const rf = rt(f);
check("tab indent preserved", rf.out.endsWith("- a\n\t- b\n"), JSON.stringify(rf.out));

// 7. CRLF 保持
const g = "# R\r\n## A\r\n";
const rg = rt(g);
check("CRLF preserved", rg.out.includes("\r\n") && !/[^\r]\n/.test(rg.out), JSON.stringify(rg.out));

// 8. 新节点（无 _k）类型推断
const h = parseDoc("# R\n", "R");
h.root.children.push({ data: { text: "new" }, children: [{ data: { text: "deep" }, children: [] }] });
const oh = serializeDoc({ root: h.root, virtualRoot: false, useTab: false, eol: "\n", fmInner: null, fmUpdates: { "cloudmind": "true" } });
check("new child becomes H2, grandchild H3", oh.includes("## new") && oh.includes("### deep"), oh);

// 9. 文本里的换行
const i = parseDoc("# R\n## a<br>b\n", "R");
check("<br> decoded", i.root.children[0].data.text === "a\nb");

// 10. 非导图文件的 frontmatter 保留
const j = `---\ntags: [x]\ncreated: 2026-01-01\n---\n# R\n## A\n`;
const rj = rt(j);
check("other frontmatter preserved", rj.out.includes("tags: [x]") && rj.out.includes("created: 2026-01-01") && rj.out.includes("cloudmind: true"), rj.out);

// 11. 关联线 uid 保留
const k = parseDoc(`# R\n## A <!--mm:{"uid":"u1","associativeLineTargets":["u2"]}-->\n## B <!--mm:{"uid":"u2"}-->\n`, "R");
const ok = serializeDoc({ root: k.root, virtualRoot: false, useTab: false, eol: "\n", fmInner: null, fmUpdates: {} });
check("uids kept for associative lines", ok.includes('"uid":"u1"') && ok.includes('"uid":"u2"'), ok);

// 12. 元数据中的 --> 不会破坏注释
const l = parseDoc("# R\n", "R");
l.root.children.push({ data: { text: "x", hyperlink: "a-->b" }, children: [] });
const ol = serializeDoc({ root: l.root, virtualRoot: false, useTab: false, eol: "\n", fmInner: null, fmUpdates: {} });
const pl = parseDoc(ol, "R");
check("--> in meta safe", pl.root.children[0].data.hyperlink === "a-->b", ol);

// 13. 旧标记 / 旧设置键：能识别，保存时迁移成新标记
import { buildFmUpdates, hasMindmapMark } from "../src/mdTree";
check("new mark recognised", hasMindmapMark("---\ncloudmind: true\n---\n# a"));
check("legacy mark recognised", hasMindmapMark("---\nxmind-mindmap: true\n---\n# a"));
check("markmind's mark NOT claimed", !hasMindmapMark("---\nmindmap-plugin: basic\n---\n# a"));
check("false value not recognised", !hasMindmapMark("---\ncloudmind: false\n---\n# a"));
{
  const old = "---\nxmind-mindmap: true\nxmind-layout: logicalStructure\ntags: [t]\n---\n# R\n## A\n";
  const d = parseDoc(old, "R");
  const out = serializeDoc({
    root: d.root,
    virtualRoot: d.virtualRoot,
    useTab: d.useTab,
    eol: d.eol,
    fmInner: d.fmInner,
    fmUpdates: buildFmUpdates({ layout: "logicalStructure", theme: null, rainbow: null }),
  });
  check("migrate: new mark written", out.includes("cloudmind: true"), out);
  check("migrate: legacy mark removed", !out.includes("xmind-mindmap"), out);
  check("migrate: layout key moved", out.includes("cloudmind-layout: logicalStructure") && !out.includes("xmind-layout"), out);
  check("migrate: other fm kept", out.includes("tags: [t]"), out);
}

// ---------- 备注里含有像列表 / 标题的行：保存后再读回，不能变成新节点 ----------
{
  const notes = [
    "- 第一点\n- 第二点",
    "1. 步骤一\n2. 步骤二",
    "# 不是标题",
    "* 星号\n+ 加号\n1) 括号序号",
    "说明：\n- 要点一\n  - 子要点\n结尾",
    "```\n- 代码里不转义\n# 也不\n```\n之后",
    "-",
    "*斜体* 和 #标签",
  ];
  for (const target of ["甲", "子A"]) {
    for (const note of notes) {
      const d = parseDoc("---\ncloudmind: true\n---\n# 根\n## 甲\n- 子A\n- 子B\n## 乙\n", "T");
      let f: any;
      const w = (n: any) => { if (n.data.text === target) f = n; (n.children || []).forEach(w); };
      w(d.root);
      f.data.note = note;
      const md = serializeDoc({ root: d.root, virtualRoot: d.virtualRoot, useTab: d.useTab, eol: d.eol, fmInner: d.fmInner, fmUpdates: {} });
      const d2 = parseDoc(md, "T");
      let g: any;
      const w2 = (n: any) => { if (n.data.text === target) g = n; (n.children || []).forEach(w2); };
      w2(d2.root);
      const shape = (n: any): string => n.data.text + (n.children?.length ? "(" + n.children.map(shape).join(",") + ")" : "");
      check(`note on ${target} survives: ${JSON.stringify(note).slice(0, 30)}`, shape(d2.root) === "根(甲(子A,子B),乙)" && g?.data.note === note, md);
    }
  }
  const d = parseDoc("# 根\n## 甲\n", "T");
  d.root.children[0].data.note = "```\n- x\n```\n- y";
  const md = serializeDoc({ root: d.root, virtualRoot: d.virtualRoot, useTab: d.useTab, eol: d.eol, fmInner: d.fmInner, fmUpdates: {} });
  check("list lines inside a code block are not escaped; outside they are", md.includes("```\n- x\n```\n\\- y"), md);
}
console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
process.exit(failed ? 1 : 0);
