# Scripts

开发期辅助脚本。**不进生产构建**。

## 约定

- 脚本放在本目录，`.ts`（用 tsx 跑）或 `.sh`
- 每个脚本开头注释说明用途、前置条件、产出
- 不得读 / 改 iCloud 目录之外的用户文件（开发期风险控制）

## 预期内容（按需添加）

- `export-sandbox-db.ts` — 从真机沙盒导出 SQLite 做离线分析
- `seed-fixtures.ts` — 生成测试 capture 目录（manifest + 附件）
- `check-schema.ts` — 对比 DATA-MODEL.md 与 schema.ts 常量是否同步

暂未实现，随 milestone 推进增补。
