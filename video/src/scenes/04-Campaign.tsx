import { useCurrentFrame, interpolate } from "remotion";
import { Shell, Reveal, Title, Tag, c, Mono, clamp } from "../design";
export const Campaign = () => {
  const f = useCurrentFrame();
  const active = Math.min(2, Math.floor(Math.max(0, f - 45) / 65));
  return (
    <Shell number="04" label="有限预算，持续验证">
      <div style={{ position: "absolute", left: 120, top: 175 }}>
        <Reveal>
          <Tag>CONTINUOUS TEST CAMPAIGNS</Tag>
          <Title size={102}>
            自动补查。
            <br />
            <span style={{ color: c.mint }}>失败，再验证。</span>
          </Title>
        </Reveal>
        <Reveal delay={25}>
          <div
            style={{
              fontSize: 39,
              color: c.muted,
              lineHeight: 1.7,
              marginTop: 35,
            }}
          >
            多轮测试 · 原测试复现
            <br />
            时间与调用预算 · 明确停止原因
          </div>
        </Reveal>
      </div>
      <div style={{ position: "absolute", left: 1050, top: 210, width: 730 }}>
        <Reveal delay={20}>
          <Mono
            style={{
              fontSize: 25,
              padding: 26,
              background: c.panel,
              border: `1px solid ${c.line}`,
              borderRadius: 12,
            }}
          >
            <span style={{ color: c.mint }}>$</span> askjev campaign --rounds 3
          </Mono>
        </Reveal>
        {["生成并执行", "失败用例复现", "汇总交接证据"].map((s, i) => (
          <Reveal delay={40 + i * 28} key={s}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 28,
                padding: "32px 0",
                borderBottom: `1px solid ${c.line}`,
                opacity: active >= i ? 1 : 0.4,
              }}
            >
              <div
                style={{
                  width: 55,
                  height: 55,
                  borderRadius: 50,
                  border: `1px solid ${active >= i ? c.mint : c.line}`,
                  fontSize: 27,
                  color: c.mint,
                  textAlign: "center",
                  lineHeight: "55px",
                }}
              >
                {active > i ? "✓" : i + 1}
              </div>
              <span style={{ fontSize: 42 }}>{s}</span>
            </div>
          </Reveal>
        ))}
        <div style={{ height: 4, background: c.line, marginTop: 28 }}>
          <div
            style={{
              height: 4,
              width: `${interpolate(f, [45, 245], [0, 100], clamp)}%`,
              background: c.mint,
            }}
          />
        </div>
      </div>
      <Reveal
        delay={100}
        style={{ position: "absolute", left: 120, bottom: 182 }}
      >
        <div style={{ fontSize: 30, color: c.muted }}>
          独立会话支持并行、清空与重开；测试证据持续保留。
        </div>
      </Reveal>
    </Shell>
  );
};
