"""Build local Mandarin narration and an original, deterministic synth bed. macOS + ffmpeg."""
import math, pathlib, struct, subprocess, wave
root = pathlib.Path(__file__).resolve().parents[1]
public = root / 'public'
lines = [
 '看起来正确，真的测过吗？让 ask J E V 测试智能体，追问每一个边界。',
 '读取需求，生成测试，真实执行。把可能有问题，变成可复现的证据，交给编码智能体。',
 '在这个前端样例中，六项全测发现两个预置缺陷。修复之后，同一批测试，全部通过。',
 '现在，多轮自动补查，失败再次验证。设置时间与调用预算，持续保存每一轮证据。',
 '本地执行测试，云端完成推理。连接英伟达 DGX Spark，调用 JEV 评分与千问模型。',
 'ask J E V Agent。请使用你的 ChatGPT Codex 安装技能，让每一次修改，都有证据。',
]
for i, text in enumerate(lines, 1):
    aiff = public / f'voice-{i}.aiff'
    subprocess.run(['say','-v','Tingting','-r','235','-o',str(aiff),text], check=True)
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(aiff),'-ar','48000','-ac','1',str(public/f'voice-{i}.wav')], check=True)
    aiff.unlink()
# No downloaded music; simple ambient A-minor ostinato with soft downbeats.
sr=48000
with wave.open(str(public/'music.wav'),'wb') as out:
    out.setnchannels(2);out.setsampwidth(2);out.setframerate(sr)
    for block in range(60):
        data=bytearray()
        for j in range(sr):
            t=block+j/sr; fade=min(1,t/2,(60-t)/3)
            chord=[110,130.8128,164.8138,146.8324][int(t/10)%4]
            pad=0.10*(math.sin(2*math.pi*chord*t)+0.45*math.sin(2*math.pi*chord*1.5*t))
            phase=t%0.625; note=[220,261.6256,329.6276,440][int(t/0.625)%4]
            pluck=0.07*math.exp(-phase*11)*math.sin(2*math.pi*note*t)
            beat=t%1.25; kick=0.09*math.exp(-beat*24)*math.sin(2*math.pi*(55*beat+1.7*(1-math.exp(-beat*30))))
            value=int(32767*fade*(pad+pluck+kick))
            data.extend(struct.pack('<hh',value,value))
        out.writeframes(data)
