import { useState } from "react";
import { SEXES, type Profile, type Sex } from "@bsc/shared";
import { t, type Lang } from "../i18n";
import type { Settings } from "../storage";
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from "../core/units";

interface Props {
  lang: Lang;
  settings: Settings;
  onSettings: (s: Settings) => void;
  initial: Profile | null;
  onDone: (p: Profile) => void;
}

const round1 = (n: number) => String(Math.round(n * 10) / 10);

export function ProfileScreen({ lang, settings, onSettings, initial, onDone }: Props) {
  const imperial = settings.units === "imperial";
  const init = initial?.heightCm ? cmToFtIn(initial.heightCm) : null;
  const [heightCm, setHeightCm] = useState(initial ? round1(initial.heightCm) : "");
  const [ft, setFt] = useState(init ? String(init.ft) : "");
  const [inch, setInch] = useState(init ? String(init.in) : "");
  const [weight, setWeight] = useState(initial?.weightKg ? round1(imperial ? kgToLb(initial.weightKg) : initial.weightKg) : "");
  const [age, setAge] = useState(initial?.age ? String(initial.age) : "");
  const [sex, setSex] = useState<Sex>(initial?.sex ?? "unspecified");
  const [error, setError] = useState(false);

  const switchUnits = (units: Settings["units"]) => {
    if (units === settings.units) return;
    if (units === "imperial") {
      const cm = Number(heightCm);
      if (cm > 0) {
        const v = cmToFtIn(cm);
        setFt(String(v.ft));
        setInch(String(v.in));
      }
      if (Number(weight) > 0) setWeight(round1(kgToLb(Number(weight))));
    } else {
      if (Number(ft) > 0) setHeightCm(round1(ftInToCm(Number(ft), Number(inch) || 0)));
      if (Number(weight) > 0) setWeight(round1(lbToKg(Number(weight))));
    }
    onSettings({ ...settings, units });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const h = imperial ? ftInToCm(Number(ft) || 0, Number(inch) || 0) : Number(heightCm);
    if (!(h >= 120 && h <= 230)) return setError(true);
    const w = Number(weight) > 0 ? (imperial ? lbToKg(Number(weight)) : Number(weight)) : undefined;
    const a = Number(age) >= 10 && Number(age) <= 100 ? Number(age) : undefined;
    onDone({ heightCm: h, weightKg: w, age: a, sex });
  };

  return (
    <form onSubmit={submit}>
      <label>{t(lang, "units")}</label>
      <div className="seg" role="group">
        {(["metric", "imperial"] as const).map((u) => (
          <button type="button" key={u} aria-pressed={settings.units === u} onClick={() => switchUnits(u)}>
            {t(lang, u)}
          </button>
        ))}
      </div>

      <label htmlFor="height">{t(lang, "height")}</label>
      {imperial ? (
        <div className="row">
          <input id="height" inputMode="decimal" placeholder={t(lang, "feet")} value={ft} onChange={(e) => setFt(e.target.value)} />
          <input aria-label={t(lang, "inches")} inputMode="decimal" placeholder={t(lang, "inches")} value={inch} onChange={(e) => setInch(e.target.value)} />
        </div>
      ) : (
        <input id="height" inputMode="decimal" placeholder="175" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
      )}
      {error && <div className="notice error" role="alert">{t(lang, "heightError")}</div>}

      <div className="row">
        <div>
          <label htmlFor="weight">{t(lang, "weight")}</label>
          <input id="weight" inputMode="decimal" placeholder={imperial ? "lb" : "kg"} value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div>
          <label htmlFor="age">{t(lang, "age")}</label>
          <input id="age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} />
        </div>
      </div>

      <label htmlFor="sex">{t(lang, "sex")}</label>
      <select id="sex" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
        {SEXES.map((s) => (
          <option key={s} value={s}>{t(lang, s)}</option>
        ))}
      </select>

      <div className="actions">
        <button className="primary" type="submit">{t(lang, "next")}</button>
      </div>
    </form>
  );
}
