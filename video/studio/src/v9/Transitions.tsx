import React from 'react';
import {AbsoluteFill,Easing,Freeze,useCurrentFrame} from 'remotion';
import type {TransitionPresentation,TransitionPresentationComponentProps} from '@remotion/transitions';

export type Kind='push'|'iris'|'prism';
type Props={kind:Kind};
const ease=Easing.bezier(.22,1,.36,1);
const irisEase=Easing.bezier(.65,0,.35,1);

const Presentation:React.FC<TransitionPresentationComponentProps<Props>>=({children,presentationDirection,presentationProgress,passedProps})=>{
 const p=Math.max(0,Math.min(1,presentationProgress)),e=ease(p),enter=presentationDirection==='entering';
 const kind=passedProps.kind;
 const style:React.CSSProperties=enter?
  kind==='iris'?{clipPath:`circle(${irisEase(p)*74}% at 50% 50%)`,transform:`scale(${1.05-.05*e})`}:
  {clipPath:`inset(0 ${(1-e)*100}% 0 0)`,transform:`translateX(${(1-e)*(kind==='prism'?80:125)}px) scale(${1+(1-e)*.025})`}:
  {transform:`translateX(${-e*(kind==='push'?80:0)}px) scale(${1-e*(kind==='iris'?.07:.025)})`,filter:kind==='push'?undefined:`blur(${e*5}px)`};
 return <AbsoluteFill style={{overflow:'hidden'}}>
  <AbsoluteFill style={style}>{children}</AbsoluteFill>
  {enter&&kind==='prism'&&p>0&&p<1&&<div style={{position:'absolute',top:-200,bottom:-200,left:-660+3100*e,width:500,transform:'rotate(-13deg)',background:'linear-gradient(95deg,transparent,#92e5de99,#ffcbacdd,#d1bce0bb,transparent)',filter:'blur(33px)',opacity:Math.sin(Math.PI*p)*.72,mixBlendMode:'screen'}}/>}
 </AbsoluteFill>;
};
export const motionTransition=(kind:Kind):TransitionPresentation<Props>=>({component:Presentation,props:{kind}});

// Extend only the outgoing tail. Incoming scene starts remain on the original music cues.
export const HoldScene:React.FC<{scene:React.ComponentType;length:number}>=({scene:Scene,length})=>{
 const f=useCurrentFrame();
 return f<length?<Scene/>:<Freeze frame={length-1}><Scene/></Freeze>;
};
