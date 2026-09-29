import {AbsoluteFill,useCurrentFrame} from 'remotion';
import {Camera,Center,k,keys,Stage,Thermal} from './core';
import {Completed} from './panels';
export const Fix=()=>{const f=useCurrentFrame();return <Stage horizon>
 <Camera scale={keys(f,[0,14,76,100],[1.05,.98,.98,1.32])} y={k(f,77,100,0,-60)}><Center><Completed f={f}/></Center></Camera>
 {f>28&&f<38&&<AbsoluteFill style={{opacity:Math.sin((f-28)/10*Math.PI)*.09,mixBlendMode:'screen'}}><Thermal f={f+30}/></AbsoluteFill>}
 </Stage>};
