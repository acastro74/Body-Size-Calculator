import { useEffect, useRef, useState } from "react";
import type { Profile } from "@bsc/shared";
import { t, type Key, type Lang } from "../i18n";
import { analyzePhoto, type PhotoAnalysis } from "../pose";
import { hasBlockingIssue } from "../core/photoQuality";

interface Props {
  lang: Lang;
  profile: Profile;
  analysis: PhotoAnalysis | null;
  onAnalysis: (a: PhotoAnalysis | null) => void;
  onBack: () => void;
  onNext: () => void;
}

export function PhotoScreen({ lang, profile, analysis, onAnalysis, onBack, onNext }: Props) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFailed(null);
    onAnalysis(null);
    setPreview(URL.createObjectURL(file));
    try {
      onAnalysis(await analyzePhoto(file, profile.heightCm));
    } catch (err) {
      console.error(err);
      setFailed(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    } finally {
      setBusy(false);
    }
  };

  const blocked = !analysis || hasBlockingIssue(analysis.issues);

  return (
    <section>
      <p>{t(lang, "photoHelp")}</p>
      <p className="muted">🔒 {t(lang, "privacyNote")}</p>
      <input ref={input} type="file" accept="image/*" hidden data-testid="photo-input" onChange={(e) => onFile(e.target.files?.[0])} />
      <button type="button" onClick={() => input.current?.click()} disabled={busy}>
        {t(lang, "chooseFile")}
      </button>
      {preview && <img className="preview" src={preview} alt="" />}
      {busy && <p role="status">{t(lang, "analyzing")}</p>}
      {failed && (
        <div className="notice error" role="alert">
          {t(lang, "photoLoadError")}
          <details>
            <summary>{t(lang, "technicalDetails")}</summary>
            <code>{failed}</code> <br />
            <small>{navigator.userAgent}</small>
          </details>
        </div>
      )}
      {analysis?.issues.map((i) => (
        <div key={i.code} className={`notice ${i.severity === "error" ? "error" : "warn"}`} role={i.severity === "error" ? "alert" : "status"}>
          {t(lang, `issue_${i.code}` as Key)}
        </div>
      ))}
      {analysis && !hasBlockingIssue(analysis.issues) && analysis.issues.length === 0 && <p role="status">✅ {t(lang, "photoOk")}</p>}
      {analysis && !analysis.measures && !hasBlockingIssue(analysis.issues) && <div className="notice warn">{t(lang, "noPhotoMeasures")}</div>}
      <div className="actions">
        <button type="button" onClick={onBack}>{t(lang, "back")}</button>
        <button type="button" className="primary" disabled={blocked || busy} onClick={onNext}>{t(lang, "next")}</button>
      </div>
    </section>
  );
}
