import {useCurrentFrame} from 'remotion';
import {Center,k,Stage} from './core';
import {SessionRipple,HandoffTerminal} from './panels';
export const Session=()=>{const f=useCurrentFrame();return <Stage><SessionRipple f={f}/><Center><div style={{scale:k(f,0,11,.88,1),translate:`0 ${k(f,0,11,37,0)}px`}}><HandoffTerminal compact f={f+12}/></div></Center></Stage>};
