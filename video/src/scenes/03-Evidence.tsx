import { useCurrentFrame } from "remotion";
import { Shell, Reveal, Title, Tag, c, Mono } from "../design";
export const Evidence = () => {
  const f = useCurrentFrame();
  const fixed = f >= 190;
  return (
    <Shell number="03" label="真实前端样例">
      <div style={{ position: "absolute", left: 120, top: 175 }}>
        <Reveal>
          <Tag>STOREFRONT · 已验证样例</Tag>
          <Title size={102}>
            六项全测。
            <br />
            <span style={{ color: c.mint }}>两个预置缺陷。</span>
          </Title>
        </Reveal>
        <Reveal delay={25}>
          <div
            style={{
              fontSize: 35,
              color: c.muted,
              marginTop: 38,
              lineHeight: 1.6,
            }}
          >
            满额免运费边界 · 优惠码计算
            <br />
            修复后，复用同一批测试。
          </div>
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 1110, top: 200, width: 690 }}>
        <Reveal delay={20}>
          <div
            style={{
              border: `1px solid ${c.line}`,
              borderRadius: 24,
              background: c.panel,
              padding: 42,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 29,
                color: c.muted,
              }}
            >
              <span>{fixed ? "修复回归" : "首次全量重放"}</span>
              <span style={{ color: fixed ? c.mint : c.red }}>
                {fixed ? "PASS" : "2 FAIL"}
              </span>
            </div>
            <Mono
              style={{
                fontSize: 134,
                margin: "30px 0",
                color: fixed ? c.mint : c.text,
              }}
            >
              {fixed ? "6 / 6" : "4 / 6"}
            </Mono>
            <div style={{ display: "flex", gap: 12 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <div
                  key={i}
                  style={{
                    height: 18,
                    flex: 1,
                    borderRadius: 4,
                    background: fixed || i < 4 ? c.mint : c.red,
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 27, color: c.muted, marginTop: 27 }}>
              {fixed ? "原测试保持不变" : "通过 / 执行用例数"}
            </div>
          </div>
        </Reveal>
        <Reveal delay={80}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 27,
              padding: "27px 0",
              borderBottom: `1px solid ${c.line}`,
            }}
          >
            <span>¥100 的运费</span>
            <span style={{ color: fixed ? c.mint : c.red }}>
              {fixed ? "¥0 ✓" : "预期 ¥0 / 实际 ¥5"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 27,
              padding: "27px 0",
            }}
          >
            <span>SAVE10 折扣</span>
            <span style={{ color: fixed ? c.mint : c.red }}>
              {fixed ? "¥4 ✓" : "预期 ¥4 / 实际 ¥2"}
            </span>
          </div>
        </Reveal>
      </div>
      <Reveal
        delay={95}
        style={{ position: "absolute", left: 120, bottom: 182 }}
      >
        <div style={{ fontSize: 28, color: c.muted }}>
          来源：frontend-1.3 运行记录 · 流程可视化 · 样例结果不代表全项目检出率
        </div>
      </Reveal>
    </Shell>
  );
};
