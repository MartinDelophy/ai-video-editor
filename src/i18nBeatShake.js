const rows = {
zh:['节奏震屏','按手动 BPM 震动，未自动分析音频。','震动方向','缩放','水平','垂直','旋转','节奏（四分音符）','震动强度','衰减时长（每拍）','节拍偏移'],
en:['Beat shake','Shake to manual BPM; audio is not analyzed.','Direction','Zoom','Horizontal','Vertical','Rotation','Tempo (quarter note)','Strength','Decay (% of beat)','Beat offset'],
ja:['ビートシェイク','手動BPMで振動。音声は解析しません。','方向','ズーム','水平','垂直','回転','テンポ（四分音符）','強さ','減衰（拍の割合）','拍のオフセット'],
ko:['비트 흔들림','수동 BPM에 맞춰 흔들립니다. 오디오 분석 없음.','방향','확대','수평','수직','회전','템포 (4분음표)','강도','감쇠 (박자 비율)','박자 오프셋'],
es:['Sacudida rítmica','BPM manual; no analiza el audio.','Dirección','Zoom','Horizontal','Vertical','Rotación','Tempo (negra)','Intensidad','Caída (% del pulso)','Desfase del pulso'],
fr:['Secousse rythmique','BPM manuel, sans analyse audio.','Direction','Zoom','Horizontal','Vertical','Rotation','Tempo (noire)','Intensité','Atténuation (% du temps)','Décalage du rythme'],
de:['Beat-Beben','Manuelle BPM, ohne Audioanalyse.','Richtung','Zoom','Horizontal','Vertikal','Drehung','Tempo (Viertelnote)','Stärke','Abklingen (% des Schlags)','Beat-Versatz'],
pt:['Tremor rítmico','BPM manual, sem análise de áudio.','Direção','Zoom','Horizontal','Vertical','Rotação','Tempo (semínima)','Intensidade','Decaimento (% da batida)','Deslocamento da batida'],
th:['ภาพสั่นตามจังหวะ','ใช้ BPM ที่ตั้งเอง ไม่วิเคราะห์เสียงอัตโนมัติ','ทิศทาง','ซูม','แนวนอน','แนวตั้ง','หมุน','จังหวะ (โน้ตตัวดำ)','ความแรง','ระยะลดแรง (% ของจังหวะ)','เลื่อนจังหวะ'],
vi:['Rung theo nhịp','BPM đặt tay, không phân tích âm thanh.','Hướng','Thu phóng','Ngang','Dọc','Xoay','Nhịp độ (nốt đen)','Cường độ','Suy giảm (% nhịp)','Độ lệch nhịp'],
ru:['Тряска в ритм','Ручной BPM, без анализа аудио.','Направление','Масштаб','Горизонталь','Вертикаль','Вращение','Темп (четверть)','Сила','Затухание (% доли)','Сдвиг ритма'],
it:['Scossa ritmica','BPM manuale, senza analisi audio.','Direzione','Zoom','Orizzontale','Verticale','Rotazione','Tempo (semiminima)','Intensità','Decadimento (% battito)','Offset del battito'],
id:['Guncangan irama','BPM manual, tanpa analisis audio.','Arah','Zoom','Horizontal','Vertikal','Rotasi','Tempo (not seperempat)','Kekuatan','Peluruhan (% ketukan)','Pergeseran ketukan'],
};
export const BEAT_SHAKE_COPY=Object.fromEntries(Object.entries(rows).map(([language,values])=>[language,Object.fromEntries(['shakeTitle','shakeHint','shake_direction','shake_zoom','shake_horizontal','shake_vertical','shake_rotation','shake_bpm','shake_intensity','shake_decay','shake_offset'].map((key,index)=>[key,values[index]]))]));
