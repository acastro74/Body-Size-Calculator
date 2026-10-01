import { useEffect, useState } from "react";
import type { BodyEstimate, FitPreference, GarmentType, Profile, SizeChart } from "@bsc/shared";
import { t, type Lang } from "./i18n";
import { load, save, type Settings } from "./storage";
import type { PhotoAnalysis } from "./pose";
import { ProfileScreen } from "./screens/ProfileScreen";
import { PhotoScreen } from "./screens/PhotoScreen";
import { ChartScreen } from "./screens/ChartScreen";
import { ResultScreen } from "./screens/ResultScreen";

type Step = 0 | 1 | 2 | 3;

export interface ChartSelection {
  chart: SizeChart;
  garment: GarmentType;
  fit: FitPreference;
}

export function App() {
  const stored = load();
  const [settings, setSettings] = useState<Settings>(
    stored.settings ?? { lang: navigator.language.startsWith("en") ? "en" : "es", units: "metric" },
  );
  const [profile, setProfile] = useState<Profile | null>(stored.profile ?? null);
  const [photo, setPhoto] = useState<PhotoAnalysis | null>(null);
  const [selection, setSelection] = useState<ChartSelection | null>(null);
  const [step, setStep] = useState<Step>(0);
  const lang: Lang = settings.lang;

  useEffect(() => {
    document.documentElement.lang = lang;
    save({ settings, profile: profile ?? undefined });
  }, [settings, profile, lang]);

  const stepLabels = [t(lang, "step1"), t(lang, "step2"), t(lang, "step3"), t(lang, "step4")];

  return (
    <main>
      <header>
        <h1>{t(lang, "appTitle")}</h1>
        <div className="seg" role="group" aria-label={t(lang, "language")}>
          {(["es", "en"] as const).map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setSettings({ ...settings, lang: l })}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>
      {step === 0 && <p className="tagline">{t(lang, "tagline")}</p>}
      <ol className="steps">
        {stepLabels.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            {label}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <ProfileScreen
          lang={lang}
          settings={settings}
          onSettings={setSettings}
          initial={profile}
          onDone={(p) => {
            if (!profile || profile.heightCm !== p.heightCm) setPhoto(null);
            setProfile(p);
            setStep(1);
          }}
        />
      )}
      {step === 1 && profile && (
        <PhotoScreen
          lang={lang}
          profile={profile}
          analysis={photo}
          onAnalysis={setPhoto}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <ChartScreen lang={lang} units={settings.units} onBack={() => setStep(1)} onDone={(s) => { setSelection(s); setStep(3); }} initial={selection} />
      )}
      {step === 3 && profile && selection && (
        <ResultScreen
          lang={lang}
          units={settings.units}
          profile={profile}
          photo={photo}
          selection={selection}
          onAnotherChart={() => setStep(2)}
          onStartOver={() => {
            setPhoto(null);
            setSelection(null);
            setStep(0);
          }}
        />
      )}
    </main>
  );
}

export type { BodyEstimate };
