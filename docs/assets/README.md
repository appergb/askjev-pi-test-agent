# README 演示素材

## 购物页面运费失败截图

`frontend-shipping-failure.png` 为 2026-09-25 实际 Chrome 测试保存的原始截图，未修改像素。画面属于仓库的受控购物样例，不是 askJEV 管理界面。

- 运行 ID：`run-2026-09-25T02-31-07-531Z-43e90e`。
- 场景 ID：`case-q5-ship-nocoupon`。
- 需求：数量 5，配送，无优惠券；商品金额 100.00 时免运费。
- 实际断言：`ERR_ASSERTION #shipping: expected "0.00", actual "5.00"`。
- PNG SHA-256：`36aaefdb6fdabb62695dbada147cf0bb6f52824c96f5e934bc67b70df8b7398b`。

该测试在已有修复版上的原测试回归通过。业务运行、源码快照与测试一致性见[验收摘要](../evidence/capability-review-2026-09-25.json)。
