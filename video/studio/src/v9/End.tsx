import {useCurrentFrame} from 'remotion';
import {k,Stage,Wordmark} from './core';
export const End=()=>{const f=useCurrentFrame();return <Stage>
 <div style={{position:'absolute',left:0,right:0,top:275,display:'flex',justifyContent:'center',opacity:k(f,0,9),transform:`translateY(${k(f,0,20,9,0)}px) scale(${k(f,0,23,1.12,1)})`}}><Wordmark size={120} reveal={k(f,6,23)} markDraw={k(f,0,10)}/></div>
 <div style={{position:'absolute',left:0,right:0,top:471,textAlign:'center',fontSize:54,fontWeight:490,letterSpacing:-1.4,overflow:'hidden'}}>{['让每次交付','更加安全、','更加快速。'].map((text,i)=><span key={text} style={{display:'inline-block',translate:`0 ${k(f,15+i*4,29+i*4,74,0)}px`,opacity:k(f,15+i*4,22+i*4)}}>{text}</span>)}</div>
 <div style={{position:'absolute',left:0,right:0,top:568,textAlign:'center',fontSize:30,color:'#647261',opacity:k(f,29,40),translate:`0 ${k(f,29,43,18,0)}px`}}>面向 AI 编码的自主测试 Agent</div>
 <div style={{position:'absolute',left:0,right:0,top:774,textAlign:'center',fontSize:30,color:'#244b36',opacity:k(f,38,50),letterSpacing:.2,clipPath:`inset(0 ${k(f,38,54,48,0)}% 0 ${k(f,38,54,48,0)}%)`}}>github.com/appergb/askjev-pi-test-agent</div>
 <div style={{position:'absolute',left:0,right:0,top:838,textAlign:'center',fontSize:22,color:'#7f8c7b',opacity:k(f,45,56)}}>了解产品 · 查看 Demo · 复现实测结果</div>
 </Stage>};
