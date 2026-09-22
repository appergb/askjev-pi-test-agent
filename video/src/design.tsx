import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
export const c = {
  bg: "#080d12",
  panel: "#111c24",
  text: "#eef3e9",
  muted: "#8dabae",
  mint: "#c2ff75",
  blue: "#91ddff",
  red: "#ff846c",
  line: "#29404b",
};
export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const clamp = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;
export const Reveal: React.FC<
  React.PropsWithChildren<{ delay?: number; style?: React.CSSProperties }>
> = ({ children, delay = 0, style }) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(f, [delay, delay + 20], [0, 1], clamp),
        translate: `0 ${interpolate(f, [delay, delay + 30], [38, 0], { ...clamp, easing: ease })}px`,
      }}
    >
      {children}
    </div>
  );
};
export const Shell: React.FC<
  React.PropsWithChildren<{ number: string; label: string }>
> = ({ children, number, label }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: c.bg,
        color: c.text,
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${c.line}44 1px,transparent 1px),linear-gradient(90deg,${c.line}44 1px,transparent 1px)`,
          backgroundSize: "96px 96px",
          opacity: 0.35,
          translate: `${-(f % 96) * 0.13}px 0`,
        }}
      />
      <div
        style={{
          position: "absolute",
          height: 900,
          width: 900,
          right: -300,
          top: -450,
          borderRadius: "50%",
          background: `radial-gradient(circle,${c.mint}12,transparent 68%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 62,
          left: 100,
          right: 100,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 27,
          letterSpacing: 3,
        }}
      >
        <div>
          ask<span style={{ color: c.mint, fontWeight: 800 }}>JEV</span>{" "}
          <span style={{ color: c.muted }}> / AGENT</span>
        </div>
        <div style={{ color: c.muted }}>EVIDENCE BEFORE CONFIDENCE</div>
      </div>
      {children}
      <div
        style={{
          position: "absolute",
          bottom: 52,
          left: 100,
          right: 100,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 25,
          color: c.muted,
          borderTop: `1px solid ${c.line}`,
          paddingTop: 23,
        }}
      >
        <span>
          {number} / {label}
        </span>
        <span>优化过的 Agent 框架</span>
      </div>
    </AbsoluteFill>
  );
};
export const Tag: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div
    style={{ color: c.mint, fontSize: 29, letterSpacing: 4, marginBottom: 24 }}
  >
    {children}
  </div>
);
export const Title: React.FC<React.PropsWithChildren<{ size?: number }>> = ({
  children,
  size = 116,
}) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 700,
      letterSpacing: -4,
      lineHeight: 1.18,
    }}
  >
    {children}
  </div>
);
export const Mono: React.FC<
  React.PropsWithChildren<{ style?: React.CSSProperties }>
> = ({ children, style }) => (
  <div style={{ fontFamily: "Menlo, monospace", ...style }}>{children}</div>
);
