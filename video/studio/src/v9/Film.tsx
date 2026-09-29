import React from 'react';
import {AbsoluteFill,staticFile} from 'remotion';
import {Audio} from '@remotion/media';
import {TransitionSeries,linearTiming} from '@remotion/transitions';
import {Opening} from './Opening';
import {Dispatch} from './Dispatch';
import {Structure} from './Structure';
import {Connect} from './Connect';
import {Session} from './Session';
import {Terminal} from './Terminal';
import {Macro} from './Macro';
import {Fix} from './Fix';
import {Proof} from './Proof';
import {Verified} from './Verified';
import {Launch} from './Launch';
import {End} from './End';
import {HoldScene,motionTransition,Kind} from './Transitions';
export const scenes=[
 {id:'01-Opening',c:Opening,n:145},{id:'02-Dispatch',c:Dispatch,n:93},
 {id:'03-Structure',c:Structure,n:112},{id:'04-Connect',c:Connect,n:115},
 {id:'05-Session',c:Session,n:35},
 {id:'07-Terminal',c:Terminal,n:184},{id:'08-Macro',c:Macro,n:56},
 {id:'09-Fix',c:Fix,n:100},{id:'10-Proof',c:Proof,n:143},
 {id:'11-Verified',c:Verified,n:57},{id:'12-Launch',c:Launch,n:115},
 {id:'13-End',c:End,n:107}
];
export const joins:Record<number,{kind:Kind;frames:number}>={
 0:{kind:'push',frames:10},2:{kind:'iris',frames:8},4:{kind:'push',frames:8},
 6:{kind:'prism',frames:10},7:{kind:'prism',frames:14},8:{kind:'iris',frames:12},
 9:{kind:'push',frames:10},10:{kind:'prism',frames:12},
};
export const Film:React.FC<{music?:boolean}>=({music=true})=><AbsoluteFill style={{background:'#eeece5'}}>
 <TransitionSeries>{scenes.flatMap(({id,c,n},i)=>{
  const join=joins[i];
  return [<TransitionSeries.Sequence key={id} name={id} durationInFrames={n+(join?.frames??0)}><HoldScene scene={c} length={n}/></TransitionSeries.Sequence>,
   ...(join?[<TransitionSeries.Transition key={`${id}-join`} presentation={motionTransition(join.kind)} timing={linearTiming({durationInFrames:join.frames})}/>]:[])];
 })}</TransitionSeries>
 {music&&<Audio src={staticFile('music.wav')}/>}
 </AbsoluteFill>;
