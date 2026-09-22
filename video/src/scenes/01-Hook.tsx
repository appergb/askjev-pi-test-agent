import { useCurrentFrame, interpolate } from "remotion";
import { Shell, Reveal, Title, Tag, c, clamp, Mono } from "../design";
export const Hook = () => {
  const f = useCurrentFrame();
  return (
    <Shell number="01" label="从怀疑，到证据">
      <div style={{ position: "absolute", left: 120, top: 220, width: 1100 }}>
        <Reveal>
          <Tag>AUTONOMOUS TESTING</Tag>
          <Title>
            看起来正确。
            <br />
            <span style={{ color: c.mint }}>真的测过吗？</span>
          </Title>
        </Reveal>
        <Reveal delay={32}>
          <div style={{ fontSize: 44, color: c.muted, marginTop: 45 }}>
            让测试智能体，追问每一个边界。
          </div>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1240,
          top: 225,
          width: 460,
          height: 460,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: i * 42,
              border: `1px solid ${i === 1 ? c.mint : c.line}`,
              borderRadius: i === 1 ? "24%" : "50%",
              rotate: `${f * (i === 1 ? 0.13 : -0.08) + i * 45}deg`,
            }}
          />
        ))}
        <Mono
          style={{
            position: "absolute",
            inset: 90,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 94,
            color: f > 100 ? c.red : c.mint,
          }}
        >
          {f > 100 ? "?" : "✓"}
        </Mono>
        <div
          style={{
            position: "absolute",
            width: 18,
            height: 18,
            borderRadius: 20,
            background: c.mint,
            left: 220 + 220 * Math.cos(f / 45),
            top: 220 + 220 * Math.sin(f / 45),
          }}
        />
      </div>
      <Reveal
        delay={75}
        style={{ position: "absolute", left: 120, bottom: 205 }}
      >
        <Mono style={{ fontSize: 30, color: c.muted }}>
          <span style={{ color: c.mint }}>$</span> askjev{" "}
          <span
            style={{
              opacity: interpolate(f % 32, [0, 16, 31], [1, 1, 0], clamp),
            }}
          >
            ▌
          </span>
        </Mono>
      </Reveal>
    </Shell>
  );
};
