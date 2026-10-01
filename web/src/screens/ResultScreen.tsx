import { useMemo } from "react";
import type { BodyMeasure, Profile } from "@bsc/shared";
import { t, type Key, type Lang } from "../i18n";
import type { ChartSelection } from "../App";
import type { PhotoAnalysis } from "../pose";
import type { Settings } from "../storage";
import { estimateBody, type FrontalMeasures } from "../core/bodyEstimate";
import { recommendSize } from "../core/sizeMatch";
import { cmToIn } from "../core/units";

interface Props {
  lang: Lang;
  units: Settings["units"];
  profile: Profile;
  photo: PhotoAnalysis | null;
  selection: ChartSelection;
  onAnotherChart: () => void;
  onStartOver: () => void;
}

const NO_PHOTO: FrontalMeasures = { shoulderWidthCm: null, chestWidthCm: null, waistWidthCm: null, hipWidthCm: null, armLengthCm: null };
const MEASURES: BodyMeasure[] = ["chest", "waist", "hip", "shoulder", "armLength"];

export function ResultScreen({ lang, units, profile, photo, selection, onAnotherChart, onStartOver }: Props) {
  const { body, rec } = useMemo(() => {
    const body = estimateBody(profile, photo?.measures ?? NO_PHOTO);
    return { body, rec: recommendSize(selection.chart, body, profile.heightCm, selection.garment, selection.fit) };
  }, [profile, photo, selection]);

  const fmt = (cm: number) => (units === "imperial" ? `${cmToIn(cm).toFixed(1)} in` : `${Math.round(cm)} cm`);
  const fmtRange = (cm: number) => (units === "imperial" ? `${cmToIn(cm).toFixed(1)}` : `${Math.round(cm)}`);

  return (
    <section>
      <div className="card" aria-live="polite">
        <div className="muted">{t(lang, "yourSize")}</div>
        <div className="size" data-testid="size">{rec.size}</div>
        <div className="muted">
          {t(lang, "forFit", { fit: t(lang, selection.fit).toLowerCase(), garment: t(lang, selection.garment).toLowerCase() })}
        </div>
      </div>

      <h2>{t(lang, "estimated")}</h2>
      <table>
        <tbody>
          {MEASURES.map((m) => (
            <tr key={m}>
              <th scope="row">{t(lang, `m_${m}` as Key)}</th>
              <td>{fmt(body[m].value)} <span className="muted">± {fmtRange(body[m].range)}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t(lang, "estimateNote")}</p>

      {photo && photo.issues.length > 0 && (
        <>
          <h2>{t(lang, "photoWarningsTitle")}</h2>
          {photo.issues.map((i) => <div key={i.code} className="notice warn">{t(lang, `issue_${i.code}` as Key)}</div>)}
        </>
      )}

      <div className="actions">
        <button type="button" onClick={onAnotherChart}>{t(lang, "anotherChart")}</button>
        <button type="button" className="primary" onClick={onStartOver}>{t(lang, "startOver")}</button>
      </div>
    </section>
  );
}
