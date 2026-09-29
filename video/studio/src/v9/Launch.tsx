import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Btn,Camera,Center,copy,CursorFlight,k,Stage,Spectrum} from './core';
import {IntegrationTerminal} from './panels';
export const Launch=()=>{const f=useCurrentFrame(),open=k(f,35,60),close=k(f,98,115);return <Stage horizon>
 {f<54&&<><Center><div style={{translate:`0 ${k(f,0,16,-365,0)}px`,opacity:k(f,46,54,1,0)}}><Btn f={f} clickAt={35} target="launch" style={{width:224,height:72,padding:0}}>{copy.ui.check_button}</Btn></div></Center><CursorFlight f={f} start={9} arrive={29} clickAt={35} from={[1335,800]} to={[960,540]}/></>}
 {f>=35&&<Camera scale={1-close*.87} y={-190*close} blur={close*6}><AbsoluteFill style={{clipPath:`inset(${46.7*(1-open)}% ${44.2*(1-open)}% round ${18*(1-open)}px)`}}><Center><IntegrationTerminal f={f-35}/></Center></AbsoluteFill></Camera>}
 {f>=36&&f<57&&<AbsoluteFill style={{opacity:Math.sin((f-36)/21*Math.PI)*.15,mixBlendMode:'color',pointerEvents:'none'}}><Spectrum f={f+14}/></AbsoluteFill>}
 {f>101&&<AbsoluteFill style={{opacity:Math.sin(k(f,101,115)*Math.PI)*.23,mixBlendMode:'screen',pointerEvents:'none'}}><Spectrum f={f+30}/></AbsoluteFill>}
 </Stage>};
