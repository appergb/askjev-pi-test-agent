import { useCurrentFrame, interpolate } from "remotion";
import { Shell, Reveal, Title, Tag, c, clamp } from "../design";
export const Workflow = () => {
  const f = useCurrentFrame();
  const labels = ["读取需求", "生成测试", "真实执行", "交接缺陷"];
  return (
    <Shell number="02" label="可追溯的测试流程">
      <div style={{ position: "absolute", left: 120, top: 175 }}>
        <Reveal>
          <Tag>ONE WORKFLOW · REAL EXECUTION</Tag>
          <Title size={104}>
            把“可能有问题”
            <br />
            变成可复现的证据。
          </Title>
        </Reveal>
      </div>
      <svg
        width="1680"
        height="20"
        style={{ position: "absolute", left: 120, top: 590 }}
      >
        <path d="M 0 10 H 1680" stroke={c.line} strokeWidth="2" />
        <path
          d="M 0 10 H 1680"
          stroke={c.mint}
          strokeWidth="3"
          strokeDasharray="1680"
          strokeDashoffset={interpolate(f, [20, 160], [1680, 0], clamp)}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 550,
          display: "flex",
          gap: 24,
        }}
      >
        {labels.map((label, i) => (
          <Reveal key={label} delay={25 + i * 20} style={{ flex: 1 }}>
            <div
              style={{
                padding: "36px 28px",
                background: c.panel,
                border: `1px solid ${i === 2 ? c.mint : c.line}`,
                borderRadius: 18,
              }}
            >
              <div style={{ fontSize: 25, color: c.mint, marginBottom: 28 }}>
                0{i + 1}
              </div>
              <div style={{ fontSize: 47, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 25, color: c.muted, marginTop: 20 }}>
                {
                  [
                    "固定源码快照",
                    "依据需求写断言",
                    "Chrome / Node.js",
                    "日志 · 截图 · 原测试",
                  ][i]
                }
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </Shell>
  );
};
