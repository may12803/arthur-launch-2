import {NextRequest,NextResponse} from 'next/server';
import {browserScreenshot,operateBrowser,type BrowserCommand} from '@/lib/arthur-browser-runtime';
import {authGate} from '@/lib/_auth';

export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:NextRequest){const auth=authGate(req);if(auth)return auth;try{return NextResponse.json(await operateBrowser(await req.json() as BrowserCommand))}catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:String(e)},{status:400})}}
export async function GET(req:NextRequest){const auth=authGate(req);if(auth)return auth;try{const id=req.nextUrl.searchParams.get('session_id');if(!id)return NextResponse.json({error:'session_id_required'},{status:400});const shot=await browserScreenshot(id);return new NextResponse(new Uint8Array(shot),{headers:{'content-type':'image/jpeg','cache-control':'no-store'}})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400})}}
