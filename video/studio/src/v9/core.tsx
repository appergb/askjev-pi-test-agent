import React, {useId} from 'react';
import {AbsoluteFill, CanvasImage, Img, Easing, interpolate, staticFile} from 'remotion';
import text from './copy.json';

export const copy=text;
export const P={paper:'#eeece5',ink:'#101011',orange:'#f56d43',lime:'#a1d3b5',blue:'#b8c8df',pink:'#cdc4db',line:'#28282b',muted:'#939398'};
export const expo=Easing.bezier(.16,1,.3,1);
export const ease=Easing.bezier(.65,0,.23,1);
export const k=(f:number,from:number,to:number,start=0,end=1)=>interpolate(f,[from,to],[start,end],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:expo});
export const q=(f:number,from:number,to:number,start=0,end=1)=>interpolate(f,[from,to],[start,end],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:ease});
export const lin=(f:number,from:number,to:number,start=0,end=1)=>interpolate(f,[from,to],[start,end],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
export const keys=(f:number,times:number[],values:number[])=>interpolate(f,times,values,{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:expo});

export const Stage:React.FC<{children:React.ReactNode;dark?:boolean;horizon?:boolean}>=({children,dark=false,horizon=false})=><AbsoluteFill style={{background:dark?P.ink:P.paper,color:dark?P.paper:P.ink,fontFamily:'Inter, Noto Sans SC, sans-serif',overflow:'hidden'}}>{horizon&&<Horizon/>}{children}</AbsoluteFill>;
export const Horizon=()=> <AbsoluteFill style={{background:'linear-gradient(180deg,#eeece5 32%,#f8e0cd 79%,#adcac5 100%)'}}/>;
export const Center:React.FC<{children:React.ReactNode;style?:React.CSSProperties}>=({children,style})=><AbsoluteFill style={{justifyContent:'center',alignItems:'center',...style}}>{children}</AbsoluteFill>;
export const Camera:React.FC<{children:React.ReactNode;x?:number;y?:number;scale?:number;rotate?:number;opacity?:number;blur?:number}>=({children,x=0,y=0,scale=1,rotate=0,opacity=1,blur=0})=><AbsoluteFill style={{translate:`${x}px ${y}px`,scale,rotate:`${rotate}deg`,opacity,filter:blur?`blur(${blur}px)`:undefined}}>{children}</AbsoluteFill>;
export const Mark:React.FC<{size?:number;color?:string;draw?:number;round?:number;rotate?:number;light?:boolean}>=({size=64,draw=1,rotate=0})=><div style={{width:size,height:size,flexShrink:0,position:'relative',rotate:`${rotate}deg`,opacity:draw}}><Img src={staticFile('official-brand/askjev-official.png')} style={{position:'absolute',width:size*1.15,height:size*1.15,maxWidth:'none',objectFit:'contain',left:-size*.075,top:-size*.075}}/></div>;
export const Wordmark:React.FC<{size?:number;light?:boolean;reveal?:number;markDraw?:number;markRound?:number;subtitle?:boolean}>=({size=68,light=false,reveal=1,markDraw=1,markRound=17,subtitle=false})=><div style={{display:'flex',gap:size*.15,alignItems:'center',color:light?P.paper:P.ink,whiteSpace:'nowrap'}}><Mark size={size*.96} draw={markDraw} round={markRound}/><div style={{width:size*3.15*reveal,overflow:'hidden',position:'relative',height:size*1.24}}><div style={{fontSize:size,lineHeight:1.15,fontWeight:650,letterSpacing:-size*.055,translate:`${(1-reveal)*-35}px 0`}}>askJEV</div></div>{subtitle&&<span style={{fontSize:size*.27,color:light?'#9eae90':'#999e8d',marginLeft:5}}>Agent</span>}</div>;
export const LogoBeat:React.FC<{f:number;sub?:boolean}>=({f,sub=false})=> <Center><div style={{position:'relative',scale:k(f,0,15,1.17,1)}}><Wordmark size={73} markDraw={k(f,4,13)} markRound={k(f,0,14,32,17)} reveal={k(f,12,24)} subtitle={sub}/></div></Center>;
export const Cursor:React.FC<{x:number;y:number;press?:number;size?:number}>=({x,y,press=0,size=46})=><div data-cursor-tip-x={x} data-cursor-tip-y={y} style={{position:'absolute',left:x-size*4/44,top:y-size*3/44,width:size,height:size*53/44,scale:1-.1*press,transformOrigin:'9.09% 5.66%',filter:'drop-shadow(0 3px 2px #0006)',zIndex:90}}><svg viewBox="0 0 44 53"><path d="M4 3V39L15 29L24 47L31 43L22 26L38 25Z" fill="#111112" stroke="white" strokeWidth="2.6" strokeLinejoin="round"/></svg></div>;
export const buttonPose=(f:number,clickAt:number)=>{
 const t=f-clickAt;
 if(t<0)return {scale:1,y:0,press:0};
 if(t<=3){const p=q(t,0,3);return {scale:1-.105*p,y:4*p,press:p};}
 const u=t-3;const d=Math.exp(-.255*u)*Math.cos(.59*u);
 return {scale:1-.105*d,y:4*d,press:Math.max(0,d)};
};
export const CursorFlight:React.FC<{f:number;start:number;arrive:number;clickAt:number;from:[number,number];to:[number,number];size?:number}>=({f,start,arrive,clickAt,from,to,size=46})=>{
 const p=q(f,start,arrive),u=1-p;
 const c1:[number,number]=[from[0]+(to[0]-from[0])*.2,from[1]-80];
 const c2:[number,number]=[to[0]+(from[0]-to[0])*.2,to[1]+24];
 const x=u*u*u*from[0]+3*u*u*p*c1[0]+3*u*p*p*c2[0]+p*p*p*to[0];
 const y=u*u*u*from[1]+3*u*u*p*c1[1]+3*u*p*p*c2[1]+p*p*p*to[1];
 const pose=buttonPose(f,clickAt);const age=f-clickAt;
 return <>{f>=start&&<Cursor x={x} y={y} press={pose.press} size={size}/>} {age>=0&&age<13&&<div style={{position:'absolute',left:to[0],top:to[1],translate:'-50% -50%',width:k(age,0,13,8,84),height:k(age,0,13,8,84),border:`${lin(age,0,13,2.3,1)}px solid #f09a75`,borderRadius:'50%',opacity:lin(age,0,13,.9,0),zIndex:89}}/>}</>;
};
export const Tick:React.FC<{size?:number;color?:string;progress?:number}>=({size=28,color=P.lime,progress=1})=><svg width={size} height={size} viewBox="0 0 40 40"><path d="M20 3L34 9V22Q34 32 20 37Q6 32 6 22V9Z" stroke={color} strokeWidth="2.7" fill="none"/><path d="M12 20L18 26L29 14" pathLength="1" strokeDasharray="1" strokeDashoffset={1-progress} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
export const Btn:React.FC<{children:React.ReactNode;orange?:boolean;small?:boolean;light?:boolean;style?:React.CSSProperties;f?:number;clickAt?:number;target?:string}>=({children,orange=false,small=false,light=false,style,f=-1,clickAt=9999,target})=>{const pose=buttonPose(f,clickAt);const white=orange||light;return <div data-ui-target={target} data-button-scale={pose.scale} style={{display:'inline-flex',alignItems:'center',justifyContent:'center',gap:10,background:white?'#f2f2f3':'linear-gradient(180deg,#242425,#151516)',color:white?'#131315':'#f3f3f4',border:`1px solid ${white?'#fff':'#444447'}`,fontSize:small?19:29,fontWeight:500,padding:small?'10px 18px':'16px 29px',borderRadius:small?9:12,whiteSpace:'nowrap',boxShadow:pose.press>.2?'inset 0 3px 8px #0005':'inset 0 1px 0 #ffffff12,0 3px 8px #0002',scale:pose.scale,translate:`0 ${pose.y}px`,filter:`brightness(${1-pose.press*.15})`,...style}}>{children}</div>};
export const Pill:React.FC<{children:React.ReactNode;fill?:string}>=({children,fill='transparent'})=><div style={{fontSize:44,border:'2px solid currentColor',borderRadius:24,lineHeight:1.1,padding:'3px 19px 8px',background:fill,whiteSpace:'nowrap'}}>{children}</div>;
export const Chip:React.FC<{macro?:boolean;style?:React.CSSProperties}>=({macro=false,style})=><CanvasImage src={staticFile(macro?'official-brand/shield-hero.png':'official-brand/shield-hero.png')} style={{width:'100%',height:'100%',objectFit:'cover',...style}}/>;

export const Spectrum:React.FC<{f:number;opacity?:number;soft?:boolean}>=({f,opacity=1,soft=false})=>{
 const id=useId().replace(/:/g,'');
 return <AbsoluteFill style={{opacity,overflow:'hidden'}}><svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{filter:soft?'blur(26px)':'blur(2px)'}}><defs><linearGradient id={'g'+id} x1="0" y1="0" x2=".3" y2="1"><stop stopColor="#90f4f0"/><stop offset=".12" stopColor="#f4f9c4"/><stop offset=".24" stopColor="#ffdc85"/><stop offset=".36" stopColor="#ff9024"/><stop offset=".48" stopColor="#ffccdf"/><stop offset=".58" stopColor="#d5b5e9"/><stop offset=".71" stopColor="#a3daef"/><stop offset=".86" stopColor="#d8fff2"/><stop offset="1" stopColor="#fff5c5"/></linearGradient><filter id={'w'+id} x="-25%" y="-40%" width="150%" height="180%"><feTurbulence type="fractalNoise" baseFrequency="0.003 0.009" numOctaves="2" seed="9" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale={150+Math.sin(f/19)*60} xChannelSelector="R" yChannelSelector="G"/></filter></defs><rect width="1920" height="1080" fill="#eeced9"/><g filter={`url(#w${id})`} transform={`translate(${Math.sin(f/32)*100},${Math.cos(f/37)*50}) rotate(${Math.sin(f/51)*8} 960 540)`}>{Array.from({length:9},(_,i)=><ellipse key={i} cx={900+Math.sin(f/35+i*.6)*450} cy={570+Math.cos(f/46+i)*150} rx={1750-i*140} ry={850-i*85} fill={`url(#g${id})`} transform={`rotate(${i*9+Math.sin(f/45)*8} 960 540)`}/>)}</g></svg></AbsoluteFill>;
};
export const Thermal:React.FC<{f:number;opacity?:number}>=({f,opacity=1})=><AbsoluteFill style={{opacity}}><Chip style={{filter:'grayscale(1) contrast(2.8) brightness(1.3)',scale:1.16,translate:`${Math.sin(f/35)*45}px ${Math.cos(f/40)*20}px`}}/><Spectrum f={f} opacity={.9}/><AbsoluteFill style={{mixBlendMode:'soft-light',opacity:.75}}><Chip style={{filter:'grayscale(1) contrast(3.5) brightness(1.4)',scale:1.16,translate:`${Math.sin(f/35)*45}px ${Math.cos(f/40)*20}px`}}/></AbsoluteFill></AbsoluteFill>;

export const Symbols:React.FC<{f:number;strong?:boolean}>=({f,strong=false})=>{
 const codes=['//','{ }','<','>','/','*','/','<','>','/','{','}','/','>',';','/','<','>',':','/'];
 const fragments=['const task','askJEV()','run()','source','score','test()','return','{ agent }','check()','await','req','code'];
 return <AbsoluteFill>{codes.map((s,i)=>{const a=i*2.39996;const spread=k(f,8+i*.28,44+i*.2);const r=(140+i*19)*spread;const expansion=k(f,40,58,1,2.8);const late=f>40;const tx=late?fragments[i%fragments.length]:s;return <div key={i} style={{position:'absolute',left:960+Math.cos(a)*r*1.43*expansion,top:535+Math.sin(a)*r*expansion,translate:'-50% -50%',fontFamily:'Menlo,monospace',fontSize:late?25:40,rotate:`${late?0:(i%4-2)*8}deg`,color:i%7===2?P.orange:i%7===4?P.pink:'#52564d',opacity:k(f,3+i*.55,9+i*.55)*(strong?1:.8),whiteSpace:'nowrap'}}>{late?tx.slice(0,Math.floor(k(f,40+i*.3,48+i*.3,0,tx.length))):s}</div>})}</AbsoluteFill>;
};
