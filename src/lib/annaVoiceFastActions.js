// Only exact, unambiguous conversational/UI intents bypass the model.
// Media edits and generation always retain the shared ChatCut validation path.
const greetings = new Set(['你好','您好','嗨','哈喽','hello','hi','hey','こんにちは','안녕하세요','hola','bonjour','hallo','olá','สวัสดี','xin chào','привет','ciao','halo']);
const checks = new Set(['你好，听得到吗','你好听得到吗','听得到吗','你听得到吗','能听到吗','听得见吗','你在吗','can you hear me','are you there','聞こえますか','들리나요','me oyes','tu m’entends','kannst du mich hören','você me ouve','ได้ยินไหม','bạn có nghe thấy tôi không','ты меня слышишь','mi senti','bisa dengar saya']);
const thanks = new Set(['谢谢','谢谢你','thanks','thank you','ありがとう','감사합니다','gracias','merci','danke','obrigado','ขอบคุณ','cảm ơn','спасибо','grazie','terima kasih']);
const destinations = {
  '字幕':'captions','字幕面板':'captions','captions':'captions','subtitles':'captions',
  '媒体':'media-upload','本地上传':'media-upload','media':'media-upload','uploads':'media-upload',
  '素材库':'media-library','library':'media-library','我的素材':'my-assets','my assets':'my-assets',
  '音频':'audio','音频面板':'audio','audio':'audio','效果':'effects','effects':'effects',
  '贴纸':'stickers','stickers':'stickers','设置':'settings','settings':'settings',
  '配音':'voice-synthesis','语音合成':'voice-synthesis','voice synthesis':'voice-synthesis',
  '声音克隆':'voice-clone','克隆声音':'voice-clone','voice cloning':'voice-clone',
  '自动字幕':'automatic-captions','automatic captions':'automatic-captions',
  '对话剪辑':'chatcut','chatcut':'chatcut','导出设置':'export','export settings':'export',
};
const controls={'播放':'play','开始播放':'play','播放视频':'play','play':'play','play video':'play','暂停':'pause','暂停播放':'pause','暂停视频':'pause','pause':'pause','pause video':'pause','撤销':'undo','撤销上一步':'undo','undo':'undo','重做':'redo','redo':'redo'};
export function resolveVoiceFastIntent(instruction) {
  const text=String(instruction||'').normalize('NFKC').trim().toLowerCase().replace(/[。！？!?.,，]+$/u,'').trim();
  if(greetings.has(text))return {kind:'hello'};
  if(checks.has(text))return {kind:'hear'};
  if(thanks.has(text))return {kind:'thanks'};
  const command=text.replace(/^(?:请帮我|帮我|请)/u,'').replace(/^please\s+/u,'').trim();
  if(controls[command])return {kind:'control',action:controls[command]};
  const match=command.match(/^(?:打开|切换到|进入)(.+)$/u)||command.match(/^(?:open|go to|switch to)\s+(.+)$/u);
  const destination=match&&destinations[match[1].trim()];
  return destination?{kind:'navigate',destination}:null;
}
export async function runVoiceFastAction({instruction,editor,copy,signal}) {
  const intent=resolveVoiceFastIntent(instruction);if(!intent)return null;
  signal?.throwIfAborted();
  if(['hello','hear','thanks'].includes(intent.kind))return {text:copy[intent.kind]};
  const names=new Set(editor.tools().map(tool=>tool.name));
  const tool=intent.kind==='navigate'?'timeline_ui_navigate':'timeline_ui_control';
  if(!names.has('timeline_ui_inspect')||!names.has(tool))return null;
  const inspected=await editor.execute('timeline_ui_inspect',{}, {signal});
  signal?.throwIfAborted();
  if(!inspected?.ok || (intent.kind==='navigate'&&!inspected.destinations?.includes(intent.destination)))return null;
  const result=await editor.execute(tool,intent.kind==='navigate'?{destination:intent.destination}:{action:intent.action},{signal});
  signal?.throwIfAborted();
  if(!result?.ok)throw new Error('Voice action failed');
  return {text:copy.done};
}
