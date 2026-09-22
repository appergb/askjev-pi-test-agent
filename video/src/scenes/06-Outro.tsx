import { Shell, Reveal, Title, Tag, c, Mono } from "../design";
export const Outro = () => (
  <Shell number="06" label="让每一次修改，都有证据">
    <div style={{ position: "absolute", left: 120, top: 190 }}>
      <Reveal>
        <Tag>BUILT FOR CODING AGENTS</Tag>
        <div style={{ fontSize: 150, fontWeight: 700, letterSpacing: -6 }}>
          ask<span style={{ color: c.mint }}>JEV</span> Agent
        </div>
      </Reveal>
      <Reveal delay={28}>
        <Title size={88}>安装技能。开始验证。</Title>
      </Reveal>
      <Reveal delay={60}>
        <div style={{ fontSize: 41, color: c.muted, marginTop: 42 }}>
          请使用你的 ChatGPT Codex 安装该技能。
        </div>
      </Reveal>
      <Reveal delay={90}>
        <Mono
          style={{
            marginTop: 58,
            fontSize: 31,
            padding: "26px 32px",
            border: `1px solid ${c.line}`,
            borderRadius: 12,
            background: c.panel,
            width: 1530,
          }}
        >
          <span style={{ color: c.mint }}>$</span> askjev campaign --request
          task.json --select all --rounds 3
        </Mono>
      </Reveal>
      <Reveal delay={120}>
        <div style={{ marginTop: 35, fontSize: 28, color: c.muted }}>
          默认全量测试 · 原始评分仍未经校准 · 混合选测持续评估中
        </div>
      </Reveal>
    </div>
  </Shell>
);
