import { Router, Request, Response } from "express";
import { db, botUsers, configPool, userConfigs, botSettings } from "@workspace/db";
import { eq, sql, desc, count, and } from "drizzle-orm";

const router = Router();

const ADMIN_USERNAME = "Mojeao";
const sessions = new Set<string>();

function getAdminPassword() {
  return process.env["ADMIN_PASSWORD"] ?? "admin1234";
}

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isAuth(req: Request): boolean {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(/adm_tok=([^;]+)/);
  return match ? sessions.has(match[1]!) : false;
}

// ─── Base HTML layout ─────────────────────────────────────────────────────────
function page(title: string, activeNav: string, body: string): string {
  const navItems = [
    { key: "stats",     label: "داشبورد",        icon: "⬡" },
    { key: "configs",   label: "کانفیگ‌ها",       icon: "⬡" },
    { key: "users",     label: "کاربران",         icon: "⬡" },
    { key: "broadcast", label: "پیام همگانی",     icon: "⬡" },
    { key: "settings",  label: "تنظیمات",         icon: "⬡" },
  ];

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — پنل ادمین mojevpnRobot</title>
<style>
:root {
  --bg: #060b18;
  --surface: rgba(255,255,255,0.04);
  --surface2: rgba(255,255,255,0.07);
  --border: rgba(255,255,255,0.08);
  --border2: rgba(255,255,255,0.14);
  --text: #e8eaf6;
  --muted: #8892a4;
  --accent: #5b8af5;
  --accent2: #7c5bf5;
  --green: #22c55e;
  --red: #ef4444;
  --yellow: #f59e0b;
  --cyan: #22d3ee;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Tahoma,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;direction:rtl}

/* Animated background */
body::before{
  content:'';position:fixed;inset:0;
  background:radial-gradient(ellipse 80% 50% at 20% 10%,rgba(91,138,245,.12) 0%,transparent 60%),
             radial-gradient(ellipse 60% 40% at 80% 80%,rgba(124,91,245,.10) 0%,transparent 60%);
  pointer-events:none;z-index:0;
}

/* Sidebar */
.sidebar{
  position:fixed;top:0;right:0;bottom:0;width:220px;
  background:rgba(10,16,32,0.9);border-left:1px solid var(--border);
  backdrop-filter:blur(20px);z-index:100;
  display:flex;flex-direction:column;padding:20px 0;
}
.sidebar-brand{
  padding:0 20px 24px;border-bottom:1px solid var(--border);
  font-size:15px;font-weight:700;
  background:linear-gradient(135deg,var(--accent),var(--accent2));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
}
.sidebar-brand small{display:block;font-size:11px;color:var(--muted);margin-top:3px;-webkit-text-fill-color:var(--muted)}
.nav-links{flex:1;padding:16px 12px;display:flex;flex-direction:column;gap:4px}
.nav-link{
  display:flex;align-items:center;gap:10px;padding:10px 12px;
  border-radius:10px;text-decoration:none;color:var(--muted);
  font-size:14px;transition:.2s;
}
.nav-link:hover{background:var(--surface2);color:var(--text)}
.nav-link.active{background:linear-gradient(135deg,rgba(91,138,245,.2),rgba(124,91,245,.2));color:var(--accent);border:1px solid rgba(91,138,245,.3)}
.nav-icon{width:18px;height:18px;border-radius:5px;background:currentColor;opacity:.5;flex-shrink:0}
.nav-link.active .nav-icon{opacity:1}
.sidebar-footer{padding:16px;border-top:1px solid var(--border)}
.sidebar-footer a{color:var(--red);font-size:13px;text-decoration:none}
.sidebar-footer a:hover{text-decoration:underline}

/* Main */
.main{margin-right:220px;padding:32px;position:relative;z-index:1}
.page-header{margin-bottom:28px}
.page-header h1{font-size:24px;font-weight:700;letter-spacing:-.3px}
.page-header p{color:var(--muted);font-size:14px;margin-top:4px}

/* Cards */
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:28px}
.card{
  background:var(--surface);border:1px solid var(--border);
  border-radius:16px;padding:20px 16px;position:relative;overflow:hidden;
  transition:.2s;
}
.card:hover{border-color:var(--border2);transform:translateY(-2px)}
.card::before{
  content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
}
.card .val{font-size:36px;font-weight:800;line-height:1;margin-bottom:6px;
  background:linear-gradient(135deg,#fff,rgba(255,255,255,.7));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
}
.card .lbl{font-size:12px;color:var(--muted);letter-spacing:.3px}
.card.green::before{background:linear-gradient(90deg,var(--green),#16a34a)}
.card.red::before{background:linear-gradient(90deg,var(--red),#b91c1c)}
.card.yellow::before{background:linear-gradient(90deg,var(--yellow),#b45309)}
.card.cyan::before{background:linear-gradient(90deg,var(--cyan),#0891b2)}

/* Pool bars */
.pool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px}
.pool-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px}
.pool-card .pkg-name{font-size:13px;font-weight:600;margin-bottom:10px}
.pool-bar-bg{background:rgba(255,255,255,.08);border-radius:100px;height:8px;overflow:hidden}
.pool-bar{height:8px;border-radius:100px;transition:.6s}
.pool-bar.green{background:linear-gradient(90deg,var(--green),#16a34a)}
.pool-bar.red{background:linear-gradient(90deg,var(--red),#b91c1c)}
.pool-count{font-size:22px;font-weight:700;margin-top:8px}
.pool-count small{font-size:12px;color:var(--muted);font-weight:400}

/* Panel */
.panel{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px;margin-bottom:20px}
.panel-title{font-size:15px;font-weight:600;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border)}

/* Forms */
label{display:block;font-size:12px;color:var(--muted);margin-bottom:5px;margin-top:14px;letter-spacing:.3px;text-transform:uppercase}
label:first-child{margin-top:0}
input,textarea,select{
  width:100%;padding:10px 14px;
  background:rgba(0,0,0,.3);border:1px solid var(--border2);
  border-radius:10px;color:var(--text);font-size:14px;
  font-family:inherit;transition:.2s;
}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(91,138,245,.15)}
.btn{
  display:inline-flex;align-items:center;gap:6px;
  padding:10px 20px;border:none;border-radius:10px;
  cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;
  transition:.2s;margin-top:14px;
}
.btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff}
.btn-primary:hover{opacity:.9;transform:translateY(-1px)}
.btn-green{background:linear-gradient(135deg,var(--green),#16a34a);color:#fff}
.btn-green:hover{opacity:.9}
.btn-red{background:linear-gradient(135deg,var(--red),#b91c1c);color:#fff}
.btn-red:hover{opacity:.9}
.btn-sm{padding:5px 12px;font-size:12px;margin-top:0;border-radius:7px}

/* Table */
.table-wrap{overflow-x:auto;border-radius:12px;border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:10px 14px;text-align:right;color:var(--muted);font-weight:500;font-size:12px;border-bottom:1px solid var(--border);white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid var(--border);color:var(--text)}
tr:last-child td{border-bottom:none}
tr:hover td{background:var(--surface2)}

/* Badge */
.badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
.badge-green{background:rgba(34,197,94,.15);color:var(--green);border:1px solid rgba(34,197,94,.3)}
.badge-red{background:rgba(239,68,68,.15);color:var(--red);border:1px solid rgba(239,68,68,.3)}
.badge-blue{background:rgba(91,138,245,.15);color:var(--accent);border:1px solid rgba(91,138,245,.3)}

/* Alert */
.alert{padding:12px 16px;border-radius:10px;margin-bottom:18px;font-size:13px;display:flex;align-items:center;gap:8px}
.alert-ok{background:rgba(34,197,94,.1);color:var(--green);border:1px solid rgba(34,197,94,.25)}
.alert-err{background:rgba(239,68,68,.1);color:var(--red);border:1px solid rgba(239,68,68,.25)}

/* Login */
.login-wrap{display:flex;align-items:center;justify-content:center;min-height:100vh}
.login-box{
  width:360px;background:rgba(10,16,32,0.9);border:1px solid var(--border);
  border-radius:20px;padding:36px;backdrop-filter:blur(20px);
}
.login-box h1{text-align:center;margin-bottom:8px;font-size:22px}
.login-box p{text-align:center;color:var(--muted);font-size:13px;margin-bottom:28px}
.login-box .btn{width:100%;justify-content:center}

/* Row flex */
.row{display:flex;gap:12px;align-items:flex-end}
.row>*{flex:1}
.mt0{margin-top:0!important}

/* Responsive */
@media(max-width:768px){
  .sidebar{display:none}
  .main{margin-right:0;padding:16px}
  .pool-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function sidebar(active: string): string {
  const items = [
    { key: "stats",     label: "داشبورد",    dot: "🟦" },
    { key: "configs",   label: "کانفیگ‌ها",   dot: "🟩" },
    { key: "users",     label: "کاربران",     dot: "🟨" },
    { key: "broadcast", label: "پیام همگانی", dot: "🟪" },
    { key: "settings",  label: "تنظیمات",     dot: "⬜" },
  ];
  const links = items.map(i =>
    `<a href="/api/admin/${i.key}" class="nav-link${active === i.key ? " active" : ""}">
      <span style="font-size:10px">${i.dot}</span> ${i.label}
    </a>`,
  ).join("");
  return `<aside class="sidebar">
    <div class="sidebar-brand">mojevpnRobot<small>@${ADMIN_USERNAME}</small></div>
    <nav class="nav-links">${links}</nav>
    <div class="sidebar-footer"><a href="/api/admin/logout">خروج از حساب</a></div>
  </aside>`;
}

function layout(active: string, title: string, subtitle: string, content: string): string {
  return page(title, active, `${sidebar(active)}<main class="main">
    <div class="page-header"><h1>${title}</h1><p>${subtitle}</p></div>
    ${content}
  </main>`);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.get("/login", (_req, res) => {
  res.send(page("ورود", "login", `<div class="login-wrap">
    <div class="login-box">
      <h1>ورود به پنل</h1>
      <p>mojevpnRobot Admin Panel</p>
      <form method="POST" action="/api/admin/login">
        <label>رمز عبور</label>
        <input type="password" name="password" autofocus placeholder="رمز عبور را وارد کنید">
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:18px">ورود</button>
      </form>
    </div>
  </div>`));
});

router.post("/login", (req: Request, res: Response) => {
  if (req.body.password === getAdminPassword()) {
    const tok = makeToken();
    sessions.add(tok);
    res.setHeader("Set-Cookie", `adm_tok=${tok}; Path=/; HttpOnly; SameSite=Lax`);
    res.redirect("/api/admin/stats");
  } else {
    res.send(page("ورود", "login", `<div class="login-wrap">
      <div class="login-box">
        <h1>ورود به پنل</h1>
        <p>mojevpnRobot Admin Panel</p>
        <div class="alert alert-err">رمز عبور اشتباه است</div>
        <form method="POST" action="/api/admin/login">
          <label>رمز عبور</label>
          <input type="password" name="password" autofocus>
          <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:18px">ورود</button>
        </form>
      </div>
    </div>`));
  }
});

router.get("/logout", (req, res) => {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(/adm_tok=([^;]+)/);
  if (match) sessions.delete(match[1]!);
  res.setHeader("Set-Cookie", "adm_tok=; Path=/; Max-Age=0");
  res.redirect("/api/admin/login");
});

function authGuard(req: Request, res: Response, next: () => void) {
  if (isAuth(req)) return next();
  res.redirect("/api/admin/login");
}
router.use(authGuard as unknown as (req: Request, res: Response, next: () => void) => void);

// ─── Stats (Dashboard) ────────────────────────────────────────────────────────
router.get(["/", "/stats"], async (_req, res) => {
  const [
    [usersRow], [cfgRow], [availRow], [usedRow],
    [a1000], [a2000], [a5000],
    recentUsers, recentCfgs,
  ] = await Promise.all([
    db.select({ c: count() }).from(botUsers),
    db.select({ c: count() }).from(userConfigs),
    db.select({ c: count() }).from(configPool).where(eq(configPool.isUsed, false)),
    db.select({ c: count() }).from(configPool).where(eq(configPool.isUsed, true)),
    db.select({ c: count() }).from(configPool).where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, 1000))),
    db.select({ c: count() }).from(configPool).where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, 2000))),
    db.select({ c: count() }).from(configPool).where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, 5000))),
    db.select().from(botUsers).orderBy(desc(botUsers.id)).limit(5),
    db.select().from(userConfigs).orderBy(desc(userConfigs.id)).limit(5),
  ]);

  const totalUsers = usersRow?.c ?? 0;
  const totalCfgGiven = cfgRow?.c ?? 0;
  const availPool = availRow?.c ?? 0;
  const usedPool = usedRow?.c ?? 0;
  const av1 = a1000?.c ?? 0;
  const av2 = a2000?.c ?? 0;
  const av5 = a5000?.c ?? 0;
  const maxPool = Math.max(av1 + av2 + av5, 1);

  const poolCards = [
    { label: "۱۰۰۰ مگابایت", count: av1 },
    { label: "۲۰۰۰ مگابایت", count: av2 },
    { label: "۵۰۰۰ مگابایت", count: av5 },
  ].map(p => {
    const pct = Math.round(p.count / Math.max(p.count + 1, maxPool) * 100);
    const color = p.count > 0 ? "green" : "red";
    return `<div class="pool-card">
      <div class="pkg-name">پکیج ${p.label}</div>
      <div class="pool-bar-bg"><div class="pool-bar ${color}" style="width:${pct}%"></div></div>
      <div class="pool-count">${p.count} <small>کانفیگ موجود</small></div>
    </div>`;
  }).join("");

  const recentUserRows = recentUsers.map(u =>
    `<tr><td>${u.telegramId}</td><td>${u.firstName} ${u.lastName ?? ""}</td><td>${u.coins}</td></tr>`,
  ).join("");

  const recentCfgRows = recentCfgs.map(c => {
    const d = new Date(c.receivedAt);
    const dd = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return `<tr><td>${c.telegramId}</td><td>${c.packageSizeMb} MB</td><td>${c.coinsSpent}</td><td>${dd}</td></tr>`;
  }).join("");

  res.send(layout("stats", "داشبورد", "آمار کلی ربات @mojevpnRobot", `
    <div class="cards">
      <div class="card"><div class="val">${totalUsers}</div><div class="lbl">کل کاربران</div></div>
      <div class="card green"><div class="val">${totalCfgGiven}</div><div class="lbl">کانفیگ داده شده</div></div>
      <div class="card cyan"><div class="val">${availPool}</div><div class="lbl">کانفیگ موجود</div></div>
      <div class="card yellow"><div class="val">${usedPool}</div><div class="lbl">کانفیگ استفاده شده</div></div>
    </div>

    <div class="panel"><div class="panel-title">موجودی استخر به تفکیک پکیج</div>
      <div class="pool-grid">${poolCards}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="panel"><div class="panel-title">آخرین کاربران ثبت‌شده</div>
        <div class="table-wrap"><table>
          <thead><tr><th>Telegram ID</th><th>نام</th><th>سکه</th></tr></thead>
          <tbody>${recentUserRows}</tbody>
        </table></div>
      </div>
      <div class="panel"><div class="panel-title">آخرین کانفیگ‌های داده شده</div>
        <div class="table-wrap"><table>
          <thead><tr><th>کاربر</th><th>حجم</th><th>سکه</th><th>تاریخ</th></tr></thead>
          <tbody>${recentCfgRows}</tbody>
        </table></div>
      </div>
    </div>
  `));
});

// ─── Configs ──────────────────────────────────────────────────────────────────
router.get("/configs", async (req, res) => {
  const msg = (req.query["msg"] as string) ?? "";
  const err = (req.query["err"] as string) ?? "";

  const [
    [a1000], [a2000], [a5000],
    settings,
  ] = await Promise.all([
    db.select({ c: count() }).from(configPool).where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, 1000))),
    db.select({ c: count() }).from(configPool).where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, 2000))),
    db.select({ c: count() }).from(configPool).where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, 5000))),
    db.select().from(botSettings),
  ]);
  const raw = Object.fromEntries(settings.map(r => [r.key, r.value]));
  const pkg1Active = raw["pkg1000_active"] !== "false";
  const pkg2Active = raw["pkg2000_active"] !== "false";
  const pkg5Active = raw["pkg5000_active"] !== "false";
  const pkg1Cost = raw["pkg1000_cost"] ?? "5";
  const pkg2Cost = raw["pkg2000_cost"] ?? "10";
  const pkg5Cost = raw["pkg5000_cost"] ?? "20";

  const av1 = a1000?.c ?? 0;
  const av2 = a2000?.c ?? 0;
  const av5 = a5000?.c ?? 0;

  function pkgPanel(size: number, av: number, active: boolean, cost: string) {
    const color = active && av > 0 ? "var(--green)" : "var(--red)";
    const statusLabel = !active ? "🔴 غیرفعال" : av > 0 ? "🟢 فعال" : "🔴 بدون موجودی";
    return `
    <div class="panel" style="border-top:3px solid ${color}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div>
          <div class="panel-title" style="margin-bottom:4px;padding-bottom:0;border:none">پکیج ${size} مگابایت — ${cost} سکه</div>
          <span style="font-size:13px;color:${color};font-weight:600">${statusLabel} &nbsp;|&nbsp; موجودی: ${av} عدد</span>
        </div>
        <form method="POST" action="/api/admin/configs/toggle" style="margin:0">
          <input type="hidden" name="size" value="${size}">
          <input type="hidden" name="active" value="${active ? "false" : "true"}">
          <button type="submit" class="btn ${active ? "btn-red" : "btn-green"} btn-sm" style="margin-top:0">
            ${active ? "🔴 غیرفعال کن" : "🟢 فعال کن"}
          </button>
        </form>
      </div>
      <form method="POST" action="/api/admin/configs/bulk">
        <input type="hidden" name="size" value="${size}">
        <input type="hidden" name="cost" value="${cost}">
        <textarea name="links" rows="5" placeholder="هر خط یک لینک کانفیگ&#10;vless://...&#10;vmess://..."></textarea>
        <button type="submit" class="btn btn-primary" style="margin-top:10px;width:100%;justify-content:center">
          ⚡ شارژ پکیج ${size}MB
        </button>
      </form>
    </div>`;
  }

  res.send(layout("configs", "شارژ کانفیگ", "هر بخش رو پُر کن و شارژ کن", `
    ${msg ? `<div class="alert alert-ok">✅ ${msg}</div>` : ""}
    ${err ? `<div class="alert alert-err">⛔ ${err}</div>` : ""}

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px">
      ${pkgPanel(1000, av1, pkg1Active, pkg1Cost)}
      ${pkgPanel(2000, av2, pkg2Active, pkg2Cost)}
      ${pkgPanel(5000, av5, pkg5Active, pkg5Cost)}
    </div>
  `));
});

router.post("/configs/toggle", async (req, res) => {
  const { size, active } = req.body as { size: string; active: string };
  const sizeNum = parseInt(size, 10);
  const key = sizeNum === 1000 ? "pkg1000_active" : sizeNum === 2000 ? "pkg2000_active" : "pkg5000_active";
  await db.insert(botSettings).values({ key, value: active }).onConflictDoUpdate({ target: botSettings.key, set: { value: active } });
  res.redirect(`/api/admin/configs?msg=پکیج ${size}MB ${active === "true" ? "فعال" : "غیرفعال"} شد`);
});

router.post("/configs/bulk", async (req, res) => {
  const { links, size, cost } = req.body as { links: string; size: string; cost: string };
  const lines = (links ?? "").split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 10);
  if (lines.length === 0) { res.redirect("/api/admin/configs?err=هیچ لینکی یافت نشد"); return; }
  const sizeMb = parseInt(size, 10), costCoins = parseInt(cost, 10);
  if (isNaN(sizeMb) || isNaN(costCoins)) { res.redirect("/api/admin/configs?err=پارامتر نامعتبر"); return; }
  await db.insert(configPool).values(
    lines.map((l: string) => ({ configLink: l, packageSizeMb: sizeMb, costCoins, isUsed: false, addedBy: "panel" })),
  );
  res.redirect(`/api/admin/configs?msg=${lines.length} کانفیگ برای پکیج ${sizeMb}MB اضافه شد`);
});

router.post("/configs/delete", async (req, res) => {
  const id = parseInt(req.body.id as string, 10);
  if (isNaN(id)) { res.redirect("/api/admin/configs?err=شناسه نامعتبر"); return; }
  await db.delete(configPool).where(and(eq(configPool.id, id), eq(configPool.isUsed, false)));
  res.redirect("/api/admin/configs?msg=کانفیگ حذف شد");
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  const search = (req.query["q"] as string) ?? "";
  const msg = (req.query["msg"] as string) ?? "";
  const err = (req.query["err"] as string) ?? "";

  let rows;
  if (search) {
    const id = parseInt(search, 10);
    if (!isNaN(id)) {
      rows = await db.select().from(botUsers).where(eq(botUsers.telegramId, id)).limit(20);
    } else {
      rows = await db.select().from(botUsers).orderBy(desc(botUsers.id)).limit(50);
    }
  } else {
    rows = await db.select().from(botUsers).orderBy(desc(botUsers.id)).limit(50);
  }

  const tableRows = rows.map(r => `<tr>
    <td style="color:var(--muted)">${r.telegramId}</td>
    <td><b>${r.firstName}</b> ${r.lastName ?? ""}</td>
    <td>${r.username ? `<span class="badge badge-blue">@${r.username}</span>` : "<span style='color:var(--muted)'>—</span>"}</td>
    <td><b>${r.coins}</b></td>
    <td>${r.referrerTelegramId ? `<span style='color:var(--muted)'>${r.referrerTelegramId}</span>` : "—"}</td>
    <td>
      <form method="POST" action="/api/admin/users/coins" style="display:flex;gap:6px;align-items:center">
        <input type="hidden" name="id" value="${r.telegramId}">
        <input type="number" name="amount" placeholder="مثبت یا منفی" style="width:120px;padding:5px 8px">
        <button type="submit" class="btn btn-primary btn-sm">اعمال</button>
      </form>
    </td>
    <td>
      <form method="POST" action="/api/admin/users/reset-coins" style="display:inline" onsubmit="return confirm('صفر کردن سکه‌های این کاربر؟')">
        <input type="hidden" name="id" value="${r.telegramId}">
        <button type="submit" class="btn btn-red btn-sm">صفر</button>
      </form>
    </td>
  </tr>`).join("");

  res.send(layout("users", "مدیریت کاربران", `${rows.length} کاربر نمایش داده می‌شود`, `
    ${msg ? `<div class="alert alert-ok">✅ ${msg}</div>` : ""}
    ${err ? `<div class="alert alert-err">⛔ ${err}</div>` : ""}
    <div class="panel">
      <form method="GET" action="/api/admin/users" style="display:flex;gap:10px;margin-bottom:0">
        <input type="text" name="q" value="${search}" placeholder="جستجو با Telegram ID" style="max-width:300px">
        <button type="submit" class="btn btn-primary" style="margin-top:0">جستجو</button>
        ${search ? `<a href="/api/admin/users" class="btn btn-red" style="margin-top:0;text-decoration:none">پاک</a>` : ""}
      </form>
    </div>
    <div class="panel">
      <div class="panel-title">لیست کاربران</div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Telegram ID</th><th>نام</th><th>یوزرنیم</th><th>سکه</th><th>دعوت‌کننده</th><th>تغییر سکه</th><th>صفر سکه</th></tr></thead>
          <tbody>${tableRows || "<tr><td colspan='7' style='text-align:center;color:var(--muted);padding:30px'>کاربری یافت نشد</td></tr>"}</tbody>
        </table>
      </div>
    </div>
  `));
});

router.post("/users/coins", async (req, res) => {
  const id = parseInt(req.body.id as string, 10);
  const amount = parseInt(req.body.amount as string, 10);
  if (isNaN(id) || isNaN(amount)) { res.redirect("/api/admin/users?err=پارامتر نامعتبر"); return; }
  await db.update(botUsers).set({ coins: sql`${botUsers.coins} + ${amount}` }).where(eq(botUsers.telegramId, id));
  const sign = amount >= 0 ? "+" : "";
  res.redirect(`/api/admin/users?msg=${sign}${amount} سکه برای کاربر ${id} اعمال شد`);
});

router.post("/users/reset-coins", async (req, res) => {
  const id = parseInt(req.body.id as string, 10);
  if (isNaN(id)) { res.redirect("/api/admin/users?err=شناسه نامعتبر"); return; }
  await db.update(botUsers).set({ coins: 0 }).where(eq(botUsers.telegramId, id));
  res.redirect(`/api/admin/users?msg=سکه‌های کاربر ${id} صفر شد`);
});

// ─── Broadcast ────────────────────────────────────────────────────────────────
router.get("/broadcast", async (_req, res) => {
  const [usersRow] = await db.select({ c: count() }).from(botUsers);
  const total = usersRow?.c ?? 0;

  res.send(layout("broadcast", "پیام همگانی", `ارسال به ${total} کاربر`, `
    <div class="panel">
      <div class="panel-title">ارسال پیام به همه کاربران</div>
      <form method="POST" action="/api/admin/broadcast/send">
        <label>متن پیام (HTML پشتیبانی می‌شود)</label>
        <textarea name="text" rows="7" placeholder="متن پیام...&#10;&#10;می‌توانید از &lt;b&gt;bold&lt;/b&gt;، &lt;i&gt;italic&lt;/i&gt; و &lt;code&gt;code&lt;/code&gt; استفاده کنید"></textarea>
        <p style="color:var(--muted);font-size:12px;margin-top:8px">پیام به تمام <b>${total}</b> کاربر ارسال می‌شود. این عملیات قابل بازگشت نیست.</p>
        <button type="submit" class="btn btn-primary" onclick="return confirm('پیام به ${total} کاربر ارسال شود؟')">ارسال به همه کاربران</button>
      </form>
    </div>
  `));
});

router.post("/broadcast/send", async (req, res) => {
  const text = (req.body.text as string)?.trim();
  if (!text) { res.redirect("/api/admin/broadcast"); return; }

  const allUsers = await db.select({ telegramId: botUsers.telegramId }).from(botUsers);

  res.send(layout("broadcast", "در حال ارسال...", `پیام در حال ارسال به ${allUsers.length} کاربر`, `
    <div class="panel">
      <p>پیام شروع به ارسال شد. این صفحه را ببندید — پیام‌ها در پس‌زمینه ارسال می‌شوند.</p>
    </div>
  `));

  const botToken = process.env["TELEGRAM_BOT_TOKEN"];
  if (!botToken) return;

  let sent = 0, failed = 0;
  for (const u of allUsers) {
    try {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: u.telegramId, text, parse_mode: "HTML" }),
      });
      sent++;
    } catch { failed++; }
    await new Promise(r => setTimeout(r, 50));
  }
});

// ─── Settings ─────────────────────────────────────────────────────────────────
router.get("/settings", (_req, res) => {
  res.send(layout("settings", "تنظیمات", "پیکربندی پنل ادمین", `
    <div class="panel">
      <div class="panel-title">تغییر رمز عبور پنل</div>
      <form method="POST" action="/api/admin/settings/password">
        <label>رمز عبور فعلی</label>
        <input type="password" name="current" placeholder="رمز فعلی">
        <label>رمز عبور جدید</label>
        <input type="password" name="newpass" placeholder="رمز جدید">
        <label>تکرار رمز جدید</label>
        <input type="password" name="confirm" placeholder="تکرار رمز جدید">
        <button type="submit" class="btn btn-primary">تغییر رمز</button>
      </form>
    </div>

    <div class="panel">
      <div class="panel-title">اطلاعات سیستم</div>
      <table>
        <tr><td style="color:var(--muted);width:200px">ادمین ربات</td><td>@${ADMIN_USERNAME}</td></tr>
        <tr><td style="color:var(--muted)">کانال اجباری</td><td>@lnterFreedom</td></tr>
        <tr><td style="color:var(--muted)">Node.js</td><td>${process.version}</td></tr>
        <tr><td style="color:var(--muted)">محیط</td><td>${process.env["NODE_ENV"] ?? "development"}</td></tr>
      </table>
    </div>
  `));
});

router.post("/settings/password", (req, res) => {
  const { current, newpass, confirm } = req.body as { current: string; newpass: string; confirm: string };
  if (current !== getAdminPassword()) {
    res.send(layout("settings", "تنظیمات", "پیکربندی پنل", `
      <div class="alert alert-err">⛔ رمز فعلی اشتباه است</div>
      <a href="/api/admin/settings" class="btn btn-primary">بازگشت</a>
    `));
    return;
  }
  if (newpass !== confirm || newpass.length < 6) {
    res.send(layout("settings", "تنظیمات", "پیکربندی پنل", `
      <div class="alert alert-err">⛔ رمزها مطابقت ندارند یا کمتر از ۶ کاراکتر است</div>
      <a href="/api/admin/settings" class="btn btn-primary">بازگشت</a>
    `));
    return;
  }
  process.env["ADMIN_PASSWORD"] = newpass;
  res.send(layout("settings", "تنظیمات", "پیکربندی پنل", `
    <div class="alert alert-ok">✅ رمز تغییر کرد (تا ری‌استارت سرور فعال است — برای دائمی شدن ADMIN_PASSWORD را در محیط تنظیم کنید)</div>
    <a href="/api/admin/settings" class="btn btn-primary">بازگشت</a>
  `));
});

export default router;
