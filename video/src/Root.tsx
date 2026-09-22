import "./index.css";
import {
  AbsoluteFill,
  Composition,
  Folder,
  Sequence,
  staticFile,
} from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { Hook } from "./scenes/01-Hook";
import { Workflow } from "./scenes/02-Workflow";
import { Evidence } from "./scenes/03-Evidence";
import { Campaign } from "./scenes/04-Campaign";
import { Cloud } from "./scenes/05-Cloud";
import { Outro } from "./scenes/06-Outro";
const scenes = [Hook, Workflow, Evidence, Campaign, Cloud, Outro];
export const Film = () => (
  <AbsoluteFill>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={315}>
        <Hook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={315}>
        <Workflow />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={315}>
        <Evidence />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={315}>
        <Campaign />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={315}>
        <Cloud />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 15 })}
      />
      <TransitionSeries.Sequence durationInFrames={300}>
        <Outro />
      </TransitionSeries.Sequence>
    </TransitionSeries>
    {scenes.map((_, i) => (
      <Sequence
        key={i}
        from={i * 300 + 18}
        durationInFrames={280}
        layout="none"
      >
        <Audio src={staticFile(`voice-${i + 1}.wav`)} volume={0.95} />
      </Sequence>
    ))}
    <Audio src={staticFile("music.wav")} volume={0.23} />
  </AbsoluteFill>
);
export const RemotionRoot = () => (
  <>
    <Composition
      id="AskJEV-Intro"
      component={Film}
      durationInFrames={1800}
      fps={30}
      width={1920}
      height={1080}
    />
    <Folder name="Scenes">
      {scenes.map((component, i) => (
        <Composition
          key={i}
          id={`Scene-${i + 1}`}
          component={component}
          durationInFrames={300}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
    </Folder>
  </>
);
