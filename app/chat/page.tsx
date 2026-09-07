import {ChatSurfaceHost} from '../_components/ChatSurfaceHost';
import type {CSSProperties} from 'react';

const chatTheme={'--glass-bg':'#111111','--glass-bg-strong':'#151515','--glass-bg-faint':'#0a0a0a','--glass-bg-tier2':'#181818','--glass-bg-tier3':'#1f1f1f','--glass-border':'#262626','--glass-border-tier2':'#333333','--text-main':'rgba(232,232,232,.78)','--text-active':'#f2f2f2','--text-muted':'rgba(232,232,232,.48)'} as CSSProperties;
export default function ChatPage(){return <div style={{...chatTheme,height:'100%'}}><ChatSurfaceHost/></div>}
