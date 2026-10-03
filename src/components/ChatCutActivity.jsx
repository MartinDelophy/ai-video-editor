import { useEffect, useState } from "react";
import { Check, SpinnerGap, WarningCircle, Stop } from "@phosphor-icons/react";
const labels = {
  zh: ["执行详情", "执行中", "已完成", "失败", "已停止", "输入", "结果"],
  en: ["Activity", "Running", "Completed", "Failed", "Stopped", "Input", "Result"],
  ja: ["実行の詳細", "実行中", "完了", "失敗", "停止", "入力", "結果"],
  ko: ["실행 상세", "실행 중", "완료", "실패", "중지됨", "입력", "결과"],
  es: ["Actividad", "En curso", "Completado", "Error", "Detenido", "Entrada", "Resultado"],
  fr: ["Activité", "En cours", "Terminé", "Échec", "Arrêté", "Entrée", "Résultat"],
  de: ["Aktivität", "Läuft", "Abgeschlossen", "Fehlgeschlagen", "Gestoppt", "Eingabe", "Ergebnis"],
  pt: ["Atividade", "Em andamento", "Concluído", "Falhou", "Interrompido", "Entrada", "Resultado"],
  th: ["รายละเอียดการทำงาน", "กำลังทำงาน", "เสร็จแล้ว", "ล้มเหลว", "หยุดแล้ว", "ข้อมูลเข้า", "ผลลัพธ์"],
  vi: ["Chi tiết thực thi", "Đang chạy", "Hoàn tất", "Thất bại", "Đã dừng", "Đầu vào", "Kết quả"],
  ru: ["Действия", "Выполняется", "Завершено", "Ошибка", "Остановлено", "Входные данные", "Результат"],
  it: ["Attività", "In corso", "Completato", "Errore", "Interrotto", "Input", "Risultato"],
  id: ["Aktivitas", "Berjalan", "Selesai", "Gagal", "Dihentikan", "Masukan", "Hasil"],
};
export function ChatCutActivity({ events, language, live = false }) {
  const copy = labels[language?.split("-")[0]] || labels.en;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!live) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [live]);
  return <details className="chatcut-activity" open={live || undefined}>
    <summary>{copy[0]} <span>{events.length}</span></summary>
    <ol>{events.map(event => {
      const state = { running: 1, done: 2, error: 3, stopped: 4 }[event.status] || 1;
      const Icon = state === 1 ? SpinnerGap : state === 2 ? Check : state === 3 ? WarningCircle : Stop;
      return <li key={event.id} className={`is-${event.status}`}><Icon size={15} className={state === 1 ? "chatcut-spinner" : undefined} /><details><summary><code>{event.name}</code><small>{copy[state]} · {Math.max(0, (event.duration ?? now - event.startedAt) / 1000).toFixed(1)}s</small></summary>{Object.keys(event.input || {}).length > 0 && <><strong>{copy[5]}</strong><pre>{JSON.stringify(event.input, null, 2)}</pre></>}{event.output && <><strong>{copy[6]}</strong><pre>{JSON.stringify(event.output, null, 2)}</pre></>}</details></li>;
    })}</ol>
  </details>;
}
