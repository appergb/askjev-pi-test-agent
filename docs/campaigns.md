# 有预算的持续自动测试

1.5 的 `campaign` 将多轮发现、失败复现和证据交接串起来。它复用真实生成模型、JEV 评分和本地执行器。默认执行全部候选；要保持这个策略，请显式 `--select all`，因为任务文件本身可能设置了实验选测。

```bash
askjev campaign --request task.json --select all --scoring-failure all \
  --rounds 3 --max-seconds 600 --max-model-turns 60
```

所有参数都有限：轮数 1–20（默认 3），总时间 10–21600 秒（默认 600），累计模型轮次 1–400（默认 60）。每轮仍遵守 task.budget 的更小限制。模型轮次不是 token 或金额预算，不构成费用上限。取消和预算信号传到模型、评分、浏览器和 Node 执行器，收尾写文件可能略超过墙钟上限。

## 执行方式

1. 将任务批准的源码/需求/基线固定为快照，每轮从相同快照启动独立 Agent 对话；不在业务源码中写入测试。
2. 每轮都重新读取、生成、评分和执行；下一轮得到已测场景及尚未被执行候选引用的需求行。此提示不能保证自动覆盖全部边界。
3. 如果失败，用原测试和原快照再次执行相同选测策略，保留独立证据；这不会暗中扩大 lowest/highest/range 的范围。
4. 每轮完成后及复现后原子更新 `result.json` / `coding-handoff.json`，全部底层运行各自保存。异常结束也保留已完成证据。
5. 达到轮数、时间、累计模型轮次、连续两轮没有新的测试指纹，或发现源码变化、执行不完整时停止。CLI 显示具体 `stop_reason`。

浏览器测试指纹使用具体操作和断言；忽略 JSON 对象键顺序及连续只读断言顺序，不改动真实执行顺序。Node 测试按字节判断，改名、格式变化仍可能被当成新测试。指纹用于减少重复投入，不代表语义去重，更不代表独立缺陷数。

## 后台运行与管理

```bash
askjev session create --name continuous-check
askjev session campaign --id <id> --request task.json --select all \
  --scoring-failure all --rounds 5 --max-seconds 1800 --max-model-turns 90
askjev session inspect --id <id>
askjev session logs --id <id>
askjev session stop --id <id>
```

后台提交立即返回；必须等 `busy=false` 后读取 `last_result`，才能判断测试结果。`runs_directory` 中可查看运行期间的 campaign 证据。重开无新任务时保留上一任务类型与预算；清空仍保留证据。campaign 每轮使用新对话，不读取也不覆盖已有单轮会话的 conversation。支持进程后台运行，不是定时服务；进程崩溃没有步骤恢复，inspect/clear 后可重新提交。

## 评分失败和质量诊断

默认 `strict`：请求失败中止测试。`--scoring-failure all` 只允许 `all` 选择，失败时记 `backend_mode=unavailable` 和 `fallback.reason=scoring_unavailable`，所有分数保持 null，继续执行所有已生成候选。取消不会被当作评分失败吞掉。数值模式搭配此降级策略会在任务验证时被拒绝。

`score-quality.json` 记录未评分/未知项、六位小数分组后最大并列数、极端值饱和（至少两项且 80% 达到 0.000001 / 0.999999）。这是暴露风险的启发式诊断，不是已验证的质量门；没有告警仍标为 `unvalidated`。数值选测含义未变，当前并未实现 hybrid。

## 如何读取交接

汇总的 `finding_records` 是失败记录数，`reproduced_assertions` 是再次出现断言失败的记录数；同一缺陷跨轮重复仍分别保留。编码 Agent 阅读各轮原始 handoff、需求及执行证据，人工或独立审核后合并根因，再修复业务实现。

```bash
askjev handoff --from <campaign-directory>
askjev regress --from <individual-run-directory> --project <fixed-checkout>
askjev feedback --from <individual-run-directory> --regression <regression-directory>
```

修复回归以**单轮原始运行目录**作为 from，不能用 campaign 汇总目录。尚无自动修改源码、自动发 issue、自动提交修复或独立断言审查。重复失败只能证明可复现，不能证明预期本身正确。

[实际运行证据](evidence/campaign-1.5.json) · [能力缺口](diagnostic-roadmap.md)
