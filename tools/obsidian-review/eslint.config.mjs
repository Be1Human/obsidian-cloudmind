// 本地复现 Obsidian 社区自动审核用的 lint（eslint-plugin-obsidianmd 推荐配置）
// 用法（在仓库根目录）：node tools/obsidian-review/node_modules/eslint/bin/eslint.js -c tools/obsidian-review/eslint.config.mjs .
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  globalIgnores([
    "node_modules",
    "tools",
    "marketing",
    "docs",
    "main.js",
    "esbuild.config.mjs",
    "version-bump.mjs",
    "test/harness.js",
    "test/.*",
  ]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.*", "test/*.mjs", "test/*.ts"],
        },
      },
    },
  },
]);
