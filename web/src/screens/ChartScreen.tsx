import { useEffect, useRef, useState } from "react";
import { CHART_MEASURES, FIT_PREFERENCES, GARMENT_TYPES, type ChartMeasure, type FitPreference, type GarmentType, type SizeChart } from "@bsc/shared";
import { t, type Key, type Lang } from "../i18n";
import { ApiError, parseChartImage, parseChartText } from "../api";
import { validateChart } from "../core/chart";
import type { ChartSelection } from "../App";
import type { Settings } from "../storage";

interface Props {
  lang: Lang;
  units: Settings["units"];
  initial: ChartSelection | null;
  onBack: () => void;
  onDone: (s: ChartSelection) => void;
}

const API_ERRORS: Record<string, Key> = {
  rate_limited: "api_rate_limited",
  too_large: "api_too_large",
  no_chart: "api_no_chart",
};

/** Keeps the typed text locally so "45." isn't rewritten to "45" while the user types a decimal. */
function NumberCell({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setText((cur) => (Number(cur) === value || (cur.trim() === "" && value == null) ? cur : value == null ? "" : String(value)));
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = e.target.value.trim() === "" ? null : Number(e.target.value.replace(",", "."));
        onChange(n != null && Number.isFinite(n) ? n : null);
      }}
    />
  );
}

export function ChartScreen({ lang, units, initial, onBack, onDone }: Props) {
  const [chart, setChart] = useState<SizeChart | null>(initial?.chart ?? null);
  const [garment, setGarment] = useState<GarmentType>(initial?.garment ?? "jacket");
  const [fit, setFit] = useState<FitPreference>(initial?.fit ?? "regular");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Key | null>(null);
  const input = useRef<HTMLInputElement>(null);
  void units;

  const run = async (job: () => Promise<SizeChart>) => {
    setBusy(true);
    setError(null);
    try {
      setChart(await job());
    } catch (err) {
      setError(err instanceof ApiError ? (API_ERRORS[err.code] ?? "api_generic") : "api_generic");
    } finally {
      setBusy(false);
    }
  };

  // Paste a screenshot straight from the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) void run(() => parseChartImage(file));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const issues = chart ? validateChart(chart) : [];
  const canCalc = chart && !issues.some((i) => i.code === "no_chest");
  const visible = chart ? CHART_MEASURES.filter((m) => chart.rows.some((r) => r[m] != null)) : [];

  const setCell = (ri: number, m: ChartMeasure, value: number | null) =>
    setChart((c) => (c ? { ...c, rows: c.rows.map((r, i) => (i === ri ? { ...r, [m]: value } : r)) } : c));

  return (
    <section>
      <p>{t(lang, "chartHelp")}</p>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-testid="chart-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(() => parseChartImage(f)); }} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>{t(lang, "chartImage")}</button>
      <p className="muted">{t(lang, "chartPasteHint")}</p>

      <label htmlFor="chart-text">{t(lang, "chartText")}</label>
      <textarea id="chart-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="actions">
        <button type="button" disabled={busy || !text.trim()} onClick={() => void run(() => parseChartText(text))}>{t(lang, "readChart")}</button>
      </div>
      {busy && <p role="status">{t(lang, "reading")}</p>}
      {error && <div className="notice error" role="alert">{t(lang, error)}</div>}

      {chart && (
        <>
          <div className="row">
            <div>
              <label htmlFor="chart-unit">{t(lang, "chartUnit")}</label>
              <select id="chart-unit" value={chart.unit} onChange={(e) => setChart({ ...chart, unit: e.target.value as "in" | "cm" })}>
                <option value="in">in</option>
                <option value="cm">cm</option>
              </select>
            </div>
            <div>
              <label htmlFor="chart-kind">{t(lang, "chartKind")}</label>
              <select id="chart-kind" value={chart.kind} onChange={(e) => setChart({ ...chart, kind: e.target.value as SizeChart["kind"] })}>
                {(["garment", "body", "unknown"] as const).map((k) => (
                  <option key={k} value={k}>{t(lang, `kind_${k}` as Key)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t(lang, "chartTitleRow")}</th>
                  {visible.map((m) => <th key={m}>{t(lang, `col_${m}` as Key)}</th>)}
                </tr>
              </thead>
              <tbody>
                {chart.rows.map((r, ri) => (
                  <tr key={ri}>
                    <th scope="row">{r.size}</th>
                    {visible.map((m) => (
                      <td key={m}>
                        <NumberCell label={`${r.size} ${m}`} value={r[m]} onChange={(v) => setCell(ri, m, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {issues.map((i, k) => (
            <div key={k} className="notice warn">{t(lang, `chartIssue_${i.code}` as Key, { size: i.size ?? "" })}</div>
          ))}

          <div className="row">
            <div>
              <label htmlFor="garment">{t(lang, "garment")}</label>
              <select id="garment" value={garment} onChange={(e) => setGarment(e.target.value as GarmentType)}>
                {GARMENT_TYPES.map((g) => <option key={g} value={g}>{t(lang, g)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fit">{t(lang, "fit")}</label>
              <select id="fit" value={fit} onChange={(e) => setFit(e.target.value as FitPreference)}>
                {FIT_PREFERENCES.map((f) => <option key={f} value={f}>{t(lang, f)}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      <div className="actions">
        <button type="button" onClick={onBack}>{t(lang, "back")}</button>
        <button type="button" className="primary" disabled={!canCalc || busy} onClick={() => chart && onDone({ chart, garment, fit })}>
          {t(lang, "calculate")}
        </button>
      </div>
    </section>
  );
}
