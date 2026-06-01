import type { BotSettings } from "./settings";

const VALID = {
  getConfig:    "5251203410396458957",
  myConfigs:    "5391032818111363540",
  myAccount:    "5438496463044752972",
  subReferrals: "5197350061012436657",
  back:         "5422439311196834318",
  gift:         "5470177992950946662",
  star:         "5188217332748527444",
  coin:         "4958689671950369798",
  check:        "5377730836244211104",
  arrow:        "5307905813451397794",
  joy:          "5447410659077661506",
};

export const E = VALID;

export function tge(id: string, fallback: string): string {
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

export interface PoolAvailability {
  p1000: number;
  p2000: number;
  p5000: number;
}

export function mainMenuKeyboard(s: BotSettings) {
  const btn = (label: string, emojiId: string, style: string) => ({
    text: label,
    icon_custom_emoji_id: emojiId,
    style,
  });

  return {
    keyboard: [
      [btn(s.buttons.getConfig.label,  E.getConfig,    s.buttons.getConfig.style)],
      [
        btn(s.buttons.myConfigs.label,  E.myConfigs,    s.buttons.myConfigs.style),
        btn(s.buttons.account.label,    E.myAccount,    s.buttons.account.style),
      ],
      [
        btn(s.buttons.referrals.label,  E.subReferrals, s.buttons.referrals.style),
      ],
    ],
    resize_keyboard: true,
    persistent: true,
  };
}

export function configInlineKeyboard(coins: number, avail: PoolAvailability, s: BotSettings) {
  const packages = [
    { label: s.pkg1000Label, cost: s.pkg1000Cost, cb: "pkg_1000", hasStock: avail.p1000 > 0, active: s.pkg1000Active },
    { label: s.pkg2000Label, cost: s.pkg2000Cost, cb: "pkg_2000", hasStock: avail.p2000 > 0, active: s.pkg2000Active },
    { label: s.pkg5000Label, cost: s.pkg5000Cost, cb: "pkg_5000", hasStock: avail.p5000 > 0, active: s.pkg5000Active },
  ].filter(p => p.active);

  return {
    inline_keyboard: packages.map((pkg) => [{
      text:          pkg.hasStock ? `🟢 ${pkg.label}` : `🔴 ${pkg.label}`,
      callback_data: pkg.cb,
      style:         pkg.hasStock ? "success" : "danger",
    }]),
  };
}
