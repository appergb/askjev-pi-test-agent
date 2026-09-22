import { useCurrentFrame } from "remotion";
import { Shell, Reveal, Title, Tag, c } from "../design";
export const Cloud = () => {
  const f = useCurrentFrame();
  return (
    <Shell number="05" label="本地执行，云端推理">
      <div style={{ position: "absolute", left: 120, top: 175 }}>
        <Reveal>
          <Tag>DGX SPARK · NVIDIA CUDA</Tag>
          <Title size={102}>
            测试留在本地。
            <br />
            推理连接云端。
          </Title>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 540,
          width: 1680,
          height: 280,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Reveal delay={20}>
          <div
            style={{
              width: 570,
              padding: 40,
              background: c.panel,
              border: `1px solid ${c.line}`,
              borderRadius: 20,
            }}
          >
            <div style={{ fontSize: 47 }}>askJEV CLI</div>
            <div style={{ fontSize: 30, color: c.muted, marginTop: 22 }}>
              Chrome · 测试 · 证据 · 回归
            </div>
          </div>
        </Reveal>
        <svg width="330" height="160">
          <path d="M 0 80 H 330" stroke={c.line} strokeWidth="2" />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={(f * 3 + i * 110) % 330}
              cy="80"
              r="5"
              fill={c.mint}
            />
          ))}
        </svg>
        <Reveal delay={45}>
          <div
            style={{
              width: 570,
              padding: 40,
              border: `1px solid ${c.mint}`,
              borderRadius: 20,
              background: c.panel,
            }}
          >
            <div style={{ fontSize: 47 }}>DGX Spark</div>
            <div style={{ fontSize: 30, color: c.muted, marginTop: 22 }}>
              JEV 评分 · Qwen 生成
            </div>
          </div>
        </Reveal>
      </div>
      <Reveal delay={85} style={{ position: "absolute", left: 120, top: 855 }}>
        <div style={{ fontSize: 28, color: c.muted }}>
          已用技术：CUDA · BF16 · NVFP4 · FlashInfer · FP8 KV Cache
        </div>
      </Reveal>
    </Shell>
  );
};
