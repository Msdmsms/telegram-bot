import { getSetting, setSetting, getAllSettings } from "./db";

export interface BotSettings {
  welcomeText: string;
  welcomeTextRef: string;
  coinPerReferral: number;
  maintenanceMode: boolean;
  mandatoryChannels: { id: string; link: string; name: string }[];
  buttons: {
    getConfig:  { label: string; style: string };
    myConfigs:  { label: string; style: string };
    account:    { label: string; style: string };
    referrals:  { label: string; style: string };
  };
  pkg1000Label: string;
  pkg2000Label: string;
  pkg5000Label: string;
  pkg1000Cost: number;
  pkg2000Cost: number;
  pkg5000Cost: number;
  pkg1000Active: boolean;
  pkg2000Active: boolean;
  pkg5000Active: boolean;
}

const DEFAULTS: BotSettings = {
  welcomeText:
    "⭐ سلام {name} عزیز!\n\nبه پیشرفته‌ترین پلتفرم اینترنت بدون محدودیت خوش آمدی.\n\nبا دعوت دوستانت 🎁 کانفیگ رایگان دریافت کن!\n\nاز منوی زیر شروع کن:\n👇",
  welcomeTextRef:
    "🎉 سلام {name} عزیز!\n\nشما از طریق لینک دعوت وارد شدید.\n🪙 یک سکه به حساب دوستتان افزوده شد!\n\nاز منوی زیر اقدام کنید:\n👇",
  coinPerReferral: 1,
  maintenanceMode: false,
  mandatoryChannels: [{ id: "@lnterFreedom", link: "https://t.me/lnterFreedom", name: "lnterFreedom" }],
  buttons: {
    getConfig:  { label: "دریافت کانفیگ",    style: "success"  },
    myConfigs:  { label: "کانفیگ‌های من",     style: "primary"  },
    account:    { label: "حساب کاربری من",    style: "primary"  },
    referrals:  { label: "زیرمجموعه‌ها",      style: "primary"  },
  },
  pkg1000Label: "دریافت بسته ۱۰۰۰ مگابایت — ۵ سکه",
  pkg2000Label: "دریافت بسته ۲۰۰۰ مگابایت — ۱۰ سکه",
  pkg5000Label: "دریافت بسته ۵۰۰۰ مگابایت — ۲۰ سکه",
  pkg1000Cost: 5,
  pkg2000Cost: 10,
  pkg5000Cost: 20,
  pkg1000Active: true,
  pkg2000Active: true,
  pkg5000Active: true,
};

let cached: BotSettings | null = null;

export async function loadSettings(): Promise<BotSettings> {
  const raw = await getAllSettings();

  const s: BotSettings = {
    welcomeText:     raw["welcome_text"]      ?? DEFAULTS.welcomeText,
    welcomeTextRef:  raw["welcome_text_ref"]  ?? DEFAULTS.welcomeTextRef,
    coinPerReferral: parseInt(raw["coin_per_referral"] ?? "1", 10),
    maintenanceMode: raw["maintenance_mode"] === "true",
    mandatoryChannels: raw["mandatory_channels"]
      ? (JSON.parse(raw["mandatory_channels"]) as BotSettings["mandatoryChannels"])
      : DEFAULTS.mandatoryChannels,
    buttons: {
      getConfig:  { label: raw["btn_getconfig_label"]  ?? DEFAULTS.buttons.getConfig.label,  style: raw["btn_getconfig_style"]  ?? DEFAULTS.buttons.getConfig.style  },
      myConfigs:  { label: raw["btn_myconfigs_label"]  ?? DEFAULTS.buttons.myConfigs.label,  style: raw["btn_myconfigs_style"]  ?? DEFAULTS.buttons.myConfigs.style  },
      account:    { label: raw["btn_account_label"]    ?? DEFAULTS.buttons.account.label,    style: raw["btn_account_style"]    ?? DEFAULTS.buttons.account.style    },
      referrals:  { label: raw["btn_referrals_label"]  ?? DEFAULTS.buttons.referrals.label,  style: raw["btn_referrals_style"]  ?? DEFAULTS.buttons.referrals.style  },
    },
    pkg1000Label: raw["pkg1000_label"] ?? DEFAULTS.pkg1000Label,
    pkg2000Label: raw["pkg2000_label"] ?? DEFAULTS.pkg2000Label,
    pkg5000Label: raw["pkg5000_label"] ?? DEFAULTS.pkg5000Label,
    pkg1000Cost:  parseInt(raw["pkg1000_cost"] ?? "5",  10),
    pkg2000Cost:  parseInt(raw["pkg2000_cost"] ?? "10", 10),
    pkg5000Cost:  parseInt(raw["pkg5000_cost"] ?? "20", 10),
    pkg1000Active: raw["pkg1000_active"] !== "false",
    pkg2000Active: raw["pkg2000_active"] !== "false",
    pkg5000Active: raw["pkg5000_active"] !== "false",
  };

  cached = s;
  return s;
}

export function getSettings(): BotSettings {
  return cached ?? DEFAULTS;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await setSetting(key, value);
  cached = null;
}

export async function refreshSettings(): Promise<void> {
  cached = null;
  await loadSettings();
}
