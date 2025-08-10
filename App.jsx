import React, { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from "recharts";

// Personal Finance Web App (Hebrew, RTL)
// Single-file React app with routing, charts, CSV import/export, budgets, goals, tests, and localStorage persistence.
// TailwindCSS available. All text RTL/he-IL. Minimal but production-like.

// ---------- Types & Constants ----------
const CATEGORIES = [
  "מכולת",
  "דלק",
  "מסעדות",
  "דיור",
  "תקשורת",
  "בריאות/ספורט",
  "תחבורה",
  "פנאי",
  "תוכנות/מנויים",
  "אחר",
];

const DEFAULT_BUDGETS = {
  "מכולת": 1200,
  "דלק": 380,
  "מסעדות": 600,
  "דיור": 2500,
  "תקשורת": 200,
  "בריאות/ספורט": 300,
  "תחבורה": 200,
  "פנאי": 400,
  "תוכנות/מנויים": 252,
  "אחר": 300,
};

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
function ym(dateStr) { return (dateStr || "").slice(0, 7); }
function currency(n) { return (n ?? 0).toLocaleString("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }); }

const COLORS = ["#14b8a6", "#0ea5e9", "#f59e0b", "#ef4444", "#8b5cf6", "#22c55e", "#06b6d4", "#e11d48", "#84cc16", "#64748b"];

const SAMPLE_TX = [
  { id: 1, date: todayISO(), type: "income", amount: 14000, category: "הכנסה", note: "עריכת וידאו" },
  { id: 2, date: todayISO(), type: "expense", amount: 170, category: "בריאות/ספורט", note: "חדר כושר" },
  { id: 3, date: todayISO(-1), type: "expense", amount: 100, category: "תוכנות/מנויים", note: "Adobe" },
  { id: 4, date: todayISO(-2), type: "expense", amount: 190, category: "דלק", note: "תדלוק" },
  { id: 5, date: todayISO(-3), type: "expense", amount: 80, category: "מסעדות", note: "קפה + מאפה" },
];

const DEFAULT_GOALS = [
  { id: "barca", name: "טיסת ברצלונה", target: 3500, monthly: 800, startYm: new Date().toISOString().slice(0,7) },
];

// ---------- Persistence Hook ----------
function useLocalState(key, initialValue) {
  const [state, setState] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : (typeof initialValue === "function" ? initialValue() : initialValue);
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  return [state, setState];
}

// ---------- CSV Utilities (Pure) ----------
// Normalize type strings (he/en variants). Return 'income' | 'expense' | '' if unknown.
function normalizeType(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  if (!t) return '';
  if (t === 'income' || t === 'הכנסה' || t === 'in' || t === 'כניסה' || t === '+') return 'income';
  if (t === 'expense' || t === 'הוצאה' || t === 'out' || t === '-') return 'expense';
  // bank-style words
  if (t === 'credit' || t === 'זכות') return 'income';
  if (t === 'debit' || t === 'חובה') return 'expense';
  return '';
}

// Export to CSV string (simple CSV, commas in notes replaced with ';')
export function toCSVString(transactions) {
  const header = ["id","date","type","amount","category","note"].join(",");
  const rows = (transactions||[]).map(t => [
    t.id,
    t.date,
    t.type,
    t.amount,
    t.category || "",
    String(t.note || "").replace(/,/g, ";"),
  ].join(","));
  // IMPORTANT: Use "\n" explicitly to avoid unterminated-string issues
  return [header, ...rows].join("\n");
}

// Parse CSV string -> array of tx objects (aligned with export format, tolerant to missing optional cols)
export function parseCSV(text) {
  if (!text) return [];
  const lines = String(text).replace(/\uFEFF/g,'').split(/\r?\n/).filter(l=>l.trim().length>0);
  if (!lines.length) return [];
  const cols = lines[0].split(",").map(s=>s.trim());
  const idx = Object.fromEntries(cols.map((c,i)=>[c,i]));
  // Must have at least date & amount; type can be missing and inferred
  if (idx.date === undefined || idx.amount === undefined) return [];

  const out = [];
  for (let i=1;i<lines.length;i++){
    const parts = lines[i].split(",");
    const get = (name) => {
      const j = idx[name];
      return j === undefined ? '' : (parts[j] ?? '');
    };
    const date = String(get('date')).trim();
    let type = normalizeType(get('type'));
    let amtRaw = String(get('amount')).replace(/,/g,'').trim();
    if (!amtRaw) continue;
    let amount = Number(amtRaw);
    if (!Number.isFinite(amount)) continue;
    // Infer type by sign if unknown or empty
    if (!type) {
      if (amount < 0) type = 'expense';
      else if (amount > 0) type = 'income';
      else continue; // zero rows ignored
    }
    // Normalize amount to positive magnitude; direction comes from type
    amount = Math.abs(amount);

    const idRaw = get('id');
    const idNum = Number(idRaw);
    const id = Number.isFinite(idNum) ? idNum : Date.now() + Math.random();
    const category = String(get('category')||'').trim();
    const note = String(get('note')||'').trim();

    if (!date || !type || !amount) continue;
    out.push({ id, date, type, amount, category, note });
  }
  return out;
}

// ---------- Core App ----------
export default function App() {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-teal-50 to-emerald-50 text-teal-900">
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </div>
  );
}

function Shell() {
  const [transactions, setTransactions] = useLocalState("pf_tx", SAMPLE_TX);
  const [budgets, setBudgets] = useLocalState("pf_budgets", DEFAULT_BUDGETS);
  const [goals, setGoals] = useLocalState("pf_goals", DEFAULT_GOALS);
  const [expectedIncome, setExpectedIncome] = useLocalState("pf_expected_income", 14000);

  // computed history by months (last 12 months)
  const months = useMemo(() => {
    const now = new Date();
    const arr = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now); d.setMonth(d.getMonth() - i); arr.push(d.toISOString().slice(0,7));
    }
    return arr;
  }, []);

  const monthlyAgg = useMemo(() => (
    months.map((m) => {
      const list = transactions.filter((t) => ym(t.date) === m);
      const income = list.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
      const expense = list.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
      return { month: m, income, expense, net: income-expense };
    })
  ), [transactions, months]);

  const ctx = {
    transactions, setTransactions,
    budgets, setBudgets,
    goals, setGoals,
    months, monthlyAgg,
    expectedIncome, setExpectedIncome,
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <Header ctx={ctx} />
      <nav className="mt-4 mb-6 flex flex-wrap gap-2">
        {[
          ["/", "לוח מחוונים"],
          ["/transactions", "תנועות"],
          ["/budgets", "תקציבים"],
          ["/goals", "יעדים"],
          ["/import-export", "ייבוא/ייצוא"],
          ["/tests", "בדיקות"],
          ["/settings", "הגדרות"],
        ].map(([to,label]) => (
          <NavLink key={to} to={to} end className={({isActive}) => `px-4 py-2 rounded-xl border shadow-sm bg-white hover:shadow ${isActive?"ring-2 ring-teal-400":""}`}>
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Dashboard ctx={ctx} />} />
        <Route path="/transactions" element={<TransactionsPage ctx={ctx} />} />
        <Route path="/budgets" element={<BudgetsPage ctx={ctx} />} />
        <Route path="/goals" element={<GoalsPage ctx={ctx} />} />
        <Route path="/import-export" element={<ImportExportPage ctx={ctx} />} />
        <Route path="/tests" element={<TestsPage ctx={ctx} />} />
        <Route path="/settings" element={<SettingsPage ctx={ctx} />} />
      </Routes>

      <footer className="text-center text-xs text-teal-700 pt-8 pb-6">
        גרסת אפליקציה (MVP). בהמשך: משתמשים והרשאות, ייבוא אוטומטי מהבנק, סיכומי וואטסאפ/מייל.
      </footer>
    </div>
  );
}

// ---------- Header ----------
function Header({ ctx }) {
  const nowYm = new Date().toISOString().slice(0,7);
  const list = ctx.transactions.filter(t => ym(t.date)===nowYm);
  const income = list.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
  const expense = list.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
  const net = income - expense;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold">ניהול פיננסי אישי — אפליקציה</h1>
        <p className="text-teal-700">פשוט, ברור, עובד. עם גרפים, ייבוא/ייצוא ויעדים.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KPI title="הכנסות החודש (בפועל)" value={currency(income)} />
        <EditableIncomeKPI ctx={ctx} />
        <KPI title="הוצאות החודש" value={currency(expense)} />
        <KPI title="תזרים נטו" value={currency(net)} tone={net>=0?"ok":"bad"} />
      </div>
    </header>
  );
}
function EditableIncomeKPI({ ctx }){
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(ctx.expectedIncome||""));
  useEffect(()=>{ setVal(String(ctx.expectedIncome||"")); }, [ctx.expectedIncome]);
  function save(){ const n = Number(val); if(!Number.isFinite(n)||n<0) return; ctx.setExpectedIncome(n); setEditing(false); }
  const actualIncome = ctx.transactions.filter(t=>t.type==='income' && ym(t.date)===new Date().toISOString().slice(0,7)).reduce((a,b)=>a+b.amount,0);
  return (
    <div className={`bg-white rounded-2xl shadow p-4 ring-1 ring-teal-100`}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-teal-700">הכנסה חודשית צפויה</div>
        {!editing && (
          <button className="text-xs text-teal-700 hover:underline" onClick={()=>setEditing(true)}>ערוך</button>
        )}
      </div>
      {!editing ? (
        <div className="text-2xl font-bold">{currency(ctx.expectedIncome||0)}</div>
      ) : (
        <div className="flex items-center gap-2 mt-1">
          <input type="number" className="border rounded-lg px-2 py-1 w-28 text-right" value={val} onChange={e=>setVal(e.target.value)} />
          <button onClick={save} className="px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">שמור</button>
          <button onClick={()=>setEditing(false)} className="px-2 py-1 rounded-lg bg-white border hover:shadow">בטל</button>
        </div>
      )}
      <div className="text-xs text-teal-700 mt-1">פער מול בפועל: {currency((ctx.expectedIncome||0) - (actualIncome || 0))}</div>
    </div>
  );
}
function KPI({ title, value, tone }) {
  const ring = tone === "ok" ? "ring-emerald-200" : tone === "bad" ? "ring-red-200" : "ring-teal-100";
  return (
    <div className={`bg-white rounded-2xl shadow p-4 ring-1 ${ring}`}>
      <div className="text-sm text-teal-700">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ ctx }) {
  const { monthlyAgg, transactions, budgets } = ctx;
  const nowYm = new Date().toISOString().slice(0,7);
  const thisMonth = transactions.filter(t=>ym(t.date)===nowYm);
  const expensesByCat = thisMonth.filter(t=>t.type==='expense').reduce((acc,t)=>{acc[t.category||'אחר']=(acc[t.category||'אחר']||0)+t.amount; return acc;},{});
  const pieData = Object.entries(expensesByCat).map(([name,value])=>({ name, value }));

  const avgNet3 = useMemo(()=>{
    const recent = monthlyAgg.slice(-3);
    const sum = recent.reduce((a,r)=>a+r.net,0);
    return Math.round(sum / (recent.length||1));
  },[monthlyAgg]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">תזרים 12 חודשים</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ctx.monthlyAgg} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(v)=>v/1000+"k"} />
              <Tooltip formatter={(v)=>currency(v)} labelFormatter={(l)=>`חודש ${l}`} />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="net" stroke="#0ea5e9" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-sm text-teal-700 mt-3">ממוצע נטו 3 חודשים: <b>{currency(avgNet3)}</b></p>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">פילוח הוצאות לפי קטגוריה (החודש)</h2>
        {pieData.length? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={100}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v)=>currency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="text-sm text-teal-700">אין נתוני הוצאות לחודש הנוכחי.</div>}
      </div>

      <div className="lg:col-span-3 grid md:grid-cols-3 gap-4">
        <SmartHints transactions={transactions} budgets={budgets} />
      </div>
    </div>
  );
}

function SmartHints({ transactions, budgets }) {
  const nowYm = new Date().toISOString().slice(0,7);
  const monthTx = transactions.filter(t=>ym(t.date)===nowYm);
  const spentByCat = monthTx.filter(t=>t.type==='expense').reduce((m,t)=>{m[t.category||'אחר']=(m[t.category||'אחר']||0)+t.amount; return m;},{});
  const top = Object.entries(spentByCat).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return (
    <div className="md:col-span-2 bg-white rounded-2xl shadow p-4">
      <h3 className="font-semibold mb-2">המלצות חכמות</h3>
      <ul className="list-disc pr-5 text-sm text-teal-800 space-y-1">
        {top.map(([cat, amt])=>{
          const max = budgets[cat]||0; const over = amt>max && max>0;
          return <li key={cat}>בקטגוריית <b>{cat}</b> הוצאת {currency(amt)}{max?` (תקציב ${currency(max)})`:''}. {over?"כדאי להאט השבוע.":"מצב טוב, המשך כך!"}</li>;
        })}
        <li>הפרשה חודשית קבועה בתחילת חודש מקלה על עמידה ביעדים (למשל {currency(300)} ל"חיסכון נסיעות").</li>
      </ul>
    </div>
  );
}

// ---------- Transactions Page ----------
function TransactionsPage({ ctx }) {
  const [form, setForm] = useState({ date: todayISO(), type: "expense", amount: "", category: CATEGORIES[0], note: "" });
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7));

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ id: null, date: todayISO(), type: "expense", amount: "", category: CATEGORIES[0], note: "" });

  const txThisMonth = useMemo(()=> ctx.transactions.filter(t=>ym(t.date)===month), [ctx.transactions, month]);

  function addTx(e){
    e.preventDefault(); const amount = Number(form.amount); if(!amount||amount<=0) return;
    ctx.setTransactions(prev => [{ id: Date.now(), date: form.date, type: form.type, amount, category: form.type==='income'? 'הכנסה' : form.category, note: form.note.trim() }, ...prev]);
    setForm({ ...form, amount: "", note: "" });
  }
  function removeTx(id){ ctx.setTransactions(prev=>prev.filter(t=>t.id!==id)); }

  // Start editing a transaction (income or expense)
  function startEdit(t){
    setEditingId(t.id);
    setEditForm({ id: t.id, date: t.date, type: t.type, amount: String(t.amount), category: t.category || CATEGORIES[0], note: t.note || "" });
  }
  function cancelEdit(){ setEditingId(null); }
  function saveEdit(e){
    e?.preventDefault?.();
    const amt = Number(editForm.amount);
    if (!amt || amt <= 0) return;
    const updated = {
      id: editForm.id,
      date: editForm.date,
      type: editForm.type,
      amount: amt,
      category: editForm.type === 'income' ? 'הכנסה' : editForm.category,
      note: (editForm.note || '').trim(),
    };
    ctx.setTransactions(prev => prev.map(t => t.id === editingId ? updated : t));
    setEditingId(null);
  }

  const totals = useMemo(()=>{
    const income = txThisMonth.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
    const expense = txThisMonth.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
    return { income, expense, net: income-expense };
  },[txThisMonth]);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="bg-white rounded-2xl shadow p-4 lg:col-span-1">
        <h2 className="font-semibold mb-3">תנועה חדשה</h2>
        <form onSubmit={addTx} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="תאריך"><input type="date" className="w-full border rounded-xl px-3 py-2" value={form.date} onChange={e=>setForm({...form, date:e.target.value})} /></Field>
            <Field label="סוג"><select className="w-full border rounded-xl px-3 py-2" value={form.type} onChange={e=>setForm({...form, type:e.target.value})}><option value="expense">הוצאה</option><option value="income">הכנסה</option></select></Field>
          </div>
          {form.type==='expense' && (
            <Field label="קטגוריה"><select className="w-full border rounded-xl px-3 py-2" value={form.category} onChange={e=>setForm({...form, category:e.target.value})}>{CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}</select></Field>
          )}
          <Field label="סכום (₪)"><input type="number" className="w-full border rounded-xl px-3 py-2" value={form.amount} onChange={e=>setForm({...form, amount:e.target.value})} /></Field>
          <Field label="הערה"><input type="text" className="w-full border rounded-xl px-3 py-2" value={form.note} onChange={e=>setForm({...form, note:e.target.value})} placeholder="למשל: קניות / לקוח X" /></Field>
          <button className="w-full py-2 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 shadow">הוסף תנועה</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 lg:col-span-2 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">תנועות</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-teal-700">חודש:</span>
            <input type="month" value={month} onChange={e=>setMonth(e.target.value)} className="border rounded-xl px-3 py-2" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <KPI title="הכנסות" value={currency(totals.income)} />
          <KPI title="הוצאות" value={currency(totals.expense)} />
          <KPI title="נטו" value={currency(totals.net)} tone={totals.net>=0?"ok":"bad"} />
        </div>
        <div className="overflow-auto max-h-[480px] rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-teal-50 sticky top-0">
              <tr>
                <th className="text-right p-2">תאריך</th>
                <th className="text-right p-2">סוג</th>
                <th className="text-right p-2">קטגוריה</th>
                <th className="text-right p-2">הערה</th>
                <th className="text-right p-2">סכום</th>
                <th className="p-2">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {txThisMonth.map(t=> (
                editingId === t.id ? (
                  <tr key={t.id} className="border-t bg-teal-50/40">
                    <td className="p-2"><input type="date" className="border rounded-lg px-2 py-1" value={editForm.date} onChange={e=>setEditForm({...editForm, date:e.target.value})} /></td>
                    <td className="p-2">
                      <select className="border rounded-lg px-2 py-1" value={editForm.type} onChange={e=>setEditForm({...editForm, type:e.target.value})}>
                        <option value="income">הכנסה</option>
                        <option value="expense">הוצאה</option>
                      </select>
                    </td>
                    <td className="p-2">
                      {editForm.type === 'income' ? (
                        <span className="text-teal-700">הכנסה</span>
                      ) : (
                        <select className="border rounded-lg px-2 py-1" value={editForm.category} onChange={e=>setEditForm({...editForm, category:e.target.value})}>
                          {CATEGORIES.map(c=> <option key={c} value={c}>{c}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="p-2"><input type="text" className="border rounded-lg px-2 py-1 w-40" value={editForm.note} onChange={e=>setEditForm({...editForm, note:e.target.value})} /></td>
                    <td className="p-2"><input type="number" className="border rounded-lg px-2 py-1 w-28 text-right" value={editForm.amount} onChange={e=>setEditForm({...editForm, amount:e.target.value})} /></td>
                    <td className="p-2 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <button onClick={saveEdit} className="px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">שמור</button>
                        <button onClick={cancelEdit} className="px-2 py-1 rounded-lg bg-white border hover:shadow">בטל</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="border-t hover:bg-teal-50/40">
                    <td className="p-2 whitespace-nowrap">{t.date}</td>
                    <td className="p-2">{t.type==='income'?"הכנסה":"הוצאה"}</td>
                    <td className="p-2">{t.category||"—"}</td>
                    <td className="p-2">{t.note||""}</td>
                    <td className={`p-2 font-medium ${t.type==='income'?"text-emerald-700":"text-red-600"}`}>{currency(t.amount)}</td>
                    <td className="p-2 text-center">
                      <div className="flex items-center gap-3 justify-center">
                        <button onClick={()=>startEdit(t)} className="text-teal-700 hover:underline">ערוך</button>
                        <button onClick={()=>removeTx(t.id)} className="text-red-600 hover:underline">מחק</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block text-sm text-teal-700">
      <span className="mb-1 inline-block">{label}</span>
      {children}
    </label>
  );
}

// ---------- Budgets Page ----------
function BudgetsPage({ ctx }) {
  const spentByCat = useMemo(()=>{
    const nowYm = new Date().toISOString().slice(0,7);
    const tx = ctx.transactions.filter(t=>ym(t.date)===nowYm && t.type==='expense');
    return tx.reduce((m,t)=>{m[t.category||'אחר']=(m[t.category||'אחר']||0)+t.amount; return m;},{});
  },[ctx.transactions]);

  function updateBudget(cat, value){ ctx.setBudgets(prev=>({ ...prev, [cat]: Number(value)||0 })); }

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">תקציב לפי קטגוריה</h2>
        <span className="text-sm text-teal-700">לחץ על סכום כדי לערוך</span>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {Object.entries(ctx.budgets).map(([cat,max])=>{
          const spent = spentByCat[cat]||0; const pct = max? Math.min(100, Math.round((spent/max)*100)) : 0; const over = max && spent>max;
          return (
            <div key={cat} className="border rounded-xl p-3 hover:shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{cat}</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-teal-700">תקציב:</span>
                  <input type="number" className="w-24 border rounded-lg px-2 py-1 text-right" value={max} onChange={e=>updateBudget(cat, e.target.value)} />
                  <span className="text-teal-700">₪</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-2xl h-3 overflow-hidden">
                <div className={`h-3 ${over?"bg-red-500": pct>85?"bg-amber-500":"bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-sm mt-1 text-teal-700">
                <span>הוצא: {currency(spent)}</span>
                <span>נשאר: {currency(Math.max(0,(max||0)-spent))}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Goals Page ----------
function GoalsPage({ ctx }) {
  const [form, setForm] = useState({ name: "", target: "", monthly: "" });
  function addGoal(e){ e.preventDefault(); if(!form.name||!Number(form.target)) return; ctx.setGoals(prev=>[...prev, { id: Date.now().toString(), name: form.name.trim(), target: Number(form.target), monthly: Number(form.monthly)||0, startYm: new Date().toISOString().slice(0,7)}]); setForm({ name:"", target:"", monthly:""}); }
  function removeGoal(id){ ctx.setGoals(prev=>prev.filter(g=>g.id!==id)); }

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="bg-white rounded-2xl shadow p-4 lg:col-span-1">
        <h2 className="font-semibold mb-3">יעד חדש</h2>
        <form onSubmit={addGoal} className="space-y-3">
          <Field label="שם היעד"><input className="w-full border rounded-xl px-3 py-2" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="למשל: מקדמה לרכב" /></Field>
          <Field label="סכום יעד (₪)"><input type="number" className="w-full border rounded-xl px-3 py-2" value={form.target} onChange={e=>setForm({...form, target:e.target.value})} /></Field>
          <Field label="הפרשה חודשית (₪)"><input type="number" className="w-full border rounded-xl px-3 py-2" value={form.monthly} onChange={e=>setForm({...form, monthly:e.target.value})} /></Field>
          <button className="w-full py-2 rounded-xl bg-teal-600 text-white font-medium hover:bg-teal-700 shadow">הוסף יעד</button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 lg:col-span-2">
        <h2 className="font-semibold mb-3">היעדים שלי</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {ctx.goals.map((g)=>{
            const monthsToTarget = g.monthly>0 ? Math.ceil(g.target / g.monthly) : null;
            return (
              <div key={g.id} className="border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">{g.name}</div>
                  <button onClick={()=>removeGoal(g.id)} className="text-red-600 text-sm hover:underline">מחק</button>
                </div>
                <div className="text-sm text-teal-700 space-y-1">
                  <div>סכום יעד: <b>{currency(g.target)}</b></div>
                  <div>הפרשה חודשית: <b>{currency(g.monthly||0)}</b></div>
                  <div>{monthsToTarget? <>הערכה לזמן הגעה: <b>{monthsToTarget}</b> חודשים</> : "קבע סכום חודשי כדי לחשב זמן הגעה"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Import/Export Page ----------
function ImportExportPage({ ctx }) {
  function exportCSV(){
    const csv = toCSVString(ctx.transactions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  function importCSVText(text){
    const parsed = parseCSV(text);
    ctx.setTransactions(prev=>[...parsed, ...prev]);
  }

  function onFile(e){
    const f = e.target.files?.[0]; if(!f) return;
    const reader = new FileReader();
    reader.onload = () => importCSVText(String(reader.result||""));
    reader.readAsText(f);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">ייצוא CSV</h2>
        <p className="text-sm text-teal-700 mb-3">מוריד קובץ עם כל התנועות. ניתן לייבא חזרה בעתיד.</p>
        <button onClick={exportCSV} className="px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 shadow">הורדת CSV</button>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">ייבוא CSV</h2>
        <p className="text-sm text-teal-700 mb-3">פורמט עמודות: id,date,type,amount,category,note</p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="block" />
      </div>
    </div>
  );
}

// ---------- Tests Page ----------
function TestsPage({ ctx }) {
  const [results, setResults] = useState([]);

  useEffect(() => {
    const res = [];
    function assert(name, condition, detail = "") {
      res.push({ name, pass: !!condition, detail: String(detail) });
    }

    // Existing tests (fixed string literals; same intent)
    const sample = [
      { id: 11, date: "2025-01-01", type: "expense", amount: 10, category: "מכולת", note: "hello" },
      { id: 12, date: "2025-01-02", type: "income", amount: 20, category: "", note: "world" },
    ];
    const csv1 = toCSVString(sample);
    assert("CSV contains newline\\n", csv1.includes("\\n"));
    assert("CSV line count = header + rows", csv1.split("\\n").length === sample.length + 1, csv1.split("\\n").length);

    const csvCRLF = `id,date,type,amount,category,note\\r\\n1,2025-01-03,expense,15,דלק,gas\\r\\n2,2025-01-04,expense,30,מסעדות,food`;
    const parsedCRLF = parseCSV(csvCRLF);
    assert("parseCSV parses CRLF", parsedCRLF.length === 2, JSON.stringify(parsedCRLF));

    const csvLF = `id,date,type,amount,category,note\\n3,2025-01-05,income,100,,client\\n`;
    const parsedLF = parseCSV(csvLF);
    assert("parseCSV parses LF", parsedLF.length === 1, JSON.stringify(parsedLF));

    const roundtripCSV = toCSVString(sample);
    const roundParsed = parseCSV(roundtripCSV);
    assert("Roundtrip preserves length", roundParsed.length === sample.length);
    assert("Roundtrip preserves first row amount", roundParsed[0].amount === sample[0].amount);

    const withComma = [{ id: 13, date: "2025-01-06", type: "expense", amount: 50, category: "אחר", note: "a,b,c" }];
    const csv2 = toCSVString(withComma);
    assert("Commas replaced with semicolons in notes", csv2.includes("a;b;c"));

    // New tests for your requested behavior
    // 1) Unknown type + positive amount -> infer income
    const inferPos = `date,amount\\n2025-08-01,123.45`;
    const parsedInferPos = parseCSV(inferPos);
    assert("Infer income from positive amount when type missing", parsedInferPos[0]?.type === 'income');

    // 2) Unknown type + negative amount -> infer expense and abs amount
    const inferNeg = `date,amount\\n2025-08-02,-88.9`;
    const parsedInferNeg = parseCSV(inferNeg);
    assert("Infer expense from negative amount when type missing", parsedInferNeg[0]?.type === 'expense');
    assert("Negative becomes positive magnitude", parsedInferNeg[0]?.amount === 88.9);

    // 3) Bank terms credit/debit mapping
    const creditDebit = `date,type,amount\\n2025-08-03,credit,100\\n2025-08-04,debit,50`;
    const parsedCD = parseCSV(creditDebit);
    assert("'credit' => income", parsedCD[0]?.type === 'income');
    assert("'debit' => expense", parsedCD[1]?.type === 'expense');

    // Extra tests for robustness
    const withBOM = `\\uFEFFdate,type,amount\\n2025-08-07,income,1`;
    const parsedBOM = parseCSV(withBOM);
    assert("Handles BOM at start", parsedBOM.length === 1);

    const missingCols = `date,amount\\n2025-08-08,10`;
    const parsedMissing = parseCSV(missingCols);
    assert("Allows missing type (infer)", parsedMissing.length === 1 && parsedMissing[0].type === 'income');

    setResults(res);
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <h2 className="font-semibold mb-3">בדיקות אוטומטיות</h2>
      <table className="min-w-full text-sm">
        <thead className="bg-teal-50">
          <tr>
            <th className="text-right p-2">בדיקה</th>
            <th className="text-right p-2">תוצאה</th>
            <th className="text-right p-2">פרטים</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.name}</td>
              <td className={`p-2 font-medium ${r.pass?"text-emerald-700":"text-red-600"}`}>{r.pass?"עבר":"נכשל"}</td>
              <td className="p-2 text-xs text-teal-700 whitespace-pre-wrap">{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-teal-700 mt-3">אם בדיקה נכשלה, שלח לי צילום מסך/טקסט — אתקן מיד.</p>
    </div>
  );
}

// ---------- Settings Page ----------
function SettingsPage({ ctx }) {
  function resetAll(){ if(confirm("לאפס את כל הנתונים?")){ localStorage.clear(); location.reload(); } }
  const [newCat, setNewCat] = useState("");
  function addCategory(){ if(!newCat.trim()) return; if(ctx.budgets[newCat]) return; ctx.setBudgets(prev=>({ ...prev, [newCat.trim()]: 0 })); setNewCat(""); }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">קטגוריות</h2>
        <div className="flex gap-2 mb-3">
          <input className="border rounded-xl px-3 py-2 flex-1" placeholder="שם קטגוריה חדש" value={newCat} onChange={e=>setNewCat(e.target.value)} />
          <button onClick={addCategory} className="px-4 py-2 rounded-xl bg-white border shadow hover:shadow-md">הוסף</button>
        </div>
        <div className="text-sm text-teal-700">קטגוריות פעילות: {Object.keys(ctx.budgets).join(" • ")}</div>
      </div>

      <div className="bg-white rounded-2xl shadow p-4">
        <h2 className="font-semibold mb-2">נתונים</h2>
        <button onClick={resetAll} className="px-4 py-2 rounded-xl bg-red-600 text-white hover:bg-red-700 shadow">איפוס מלא</button>
      </div>
    </div>
  );
}
