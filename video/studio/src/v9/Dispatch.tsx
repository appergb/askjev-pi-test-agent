import {useCurrentFrame} from 'remotion';
import {Center,CursorFlight,k,Stage} from './core';
import {HostTerminal,DISPATCH_TARGET,AskJEVTerminal} from './panels';
export const Dispatch=()=>{const f=useCurrentFrame();return <Stage horizon>
 <Center><div style={{scale:k(f,0,13,1.13,1),translate:`0 ${k(f,0,13,40,0)}px`}}><HostTerminal f={f}/></div></Center>
 {f<62&&<CursorFlight f={f} start={12} arrive={24} clickAt={29} from={[1690,861]} to={DISPATCH_TARGET}/>}
 {f>=63&&<Center><div style={{scale:k(f,63,76,.72,1),translate:`0 ${k(f,63,76,110,0)}px`,opacity:k(f,63,72)}}><AskJEVTerminal f={f-63}/></div></Center>}
 <div style={{position:'absolute',top:980,width:'100%',textAlign:'center',fontSize:28,color:'#525b4d',opacity:k(f,55,68)}}>coding agent 调用，askJEV 接手测试。</div>
 </Stage>};
