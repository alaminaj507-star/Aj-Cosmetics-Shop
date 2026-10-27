"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient, type User } from "@supabase/supabase-js";

type Product = { id: number; name: string; purchase_price: number; sale_price: number; stock: number; low_stock_threshold: number; created_at?: string };
type Expense = { id: number; description: string; amount: number; created_at: string };
type SaleRow = Record<string, any> & { id?: number; product_id?: number; quantity?: number; qty?: number; total?: number; total_amount?: number; discount?: number; created_at?: string; user_id?: string };
type PurchaseRow = Record<string, any> & { id?: number; product_id?: number; quantity?: number; purchase_price?: number; total_cost?: number; created_at?: string };

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
const money = (v: number) => new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(v || 0));
const dateText = (v?: string) => v ? new Date(v).toLocaleString("bn-BD") : "—";
const num = (v: unknown) => Number(v ?? 0) || 0;

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState("dashboard");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [saleSearch, setSaleSearch] = useState("");
  const [productName, setProductName] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [threshold, setThreshold] = useState("5");
  const [saleProductId, setSaleProductId] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [discount, setDiscount] = useState("0");
  const [customer, setCustomer] = useState("");
  const [lastReceipt, setLastReceipt] = useState<{ id: string; product: string; qty: number; unitPrice: number; subtotal: number; discount: number; total: number; time: string; customer: string } | null>(null);
  const [restockId, setRestockId] = useState("");
  const [restockQty, setRestockQty] = useState("1");
  const [restockPrice, setRestockPrice] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  const loadAll = useCallback(async () => {
    const [pr, sa, pu, ex] = await Promise.all([
      supabase.from("products").select("id,name,purchase_price,sale_price,stock,low_stock_threshold,created_at").order("id", { ascending: false }),
      supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("purchases").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("expenses").select("id,description,amount,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (pr.error) setMessage("পণ্য লোড হয়নি: " + pr.error.message); else setProducts((pr.data ?? []) as Product[]);
    if (sa.error) setMessage("বিক্রির তালিকা লোড হয়নি: " + sa.error.message); else setSales((sa.data ?? []) as SaleRow[]);
    if (pu.error) setMessage("কেনাকাটার তালিকা লোড হয়নি: " + pu.error.message); else setPurchases((pu.data ?? []) as PurchaseRow[]);
    if (ex.error) setMessage("খরচের তালিকা লোড হয়নি: " + ex.error.message); else setExpenses((ex.data ?? []) as Expense[]);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setAuthLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => { if (user) void loadAll(); else { setProducts([]); setSales([]); setPurchases([]); setExpenses([]); } }, [user, loadAll]);

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setMessage("লগইন হচ্ছে...");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? "লগইন হয়নি: " + error.message : "লগইন সফল হয়েছে।"); if (!error) setPassword(""); setLoading(false);
  }
  async function logout() { const { error } = await supabase.auth.signOut(); setMessage(error ? "লগআউট হয়নি: " + error.message : "লগআউট হয়েছে।"); }

  async function addProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const pp = Number(purchasePrice), sp = Number(salePrice), st = Number(initialStock), th = Number(threshold);
    if (!productName.trim() || [purchasePrice, salePrice, initialStock, threshold].some(v => v.trim() === "") || ![pp, sp, st, th].every(Number.isFinite) || pp < 0 || sp < 0 || !Number.isInteger(st) || st < 0 || !Number.isInteger(th) || th < 0) { setMessage("পণ্যের নাম, দাম, স্টক ও সতর্কসীমা সঠিকভাবে পূরণ করো।"); return; }
    setLoading(true); const { error } = await supabase.from("products").insert({ name: productName.trim(), purchase_price: pp, sale_price: sp, stock: st, low_stock_threshold: th });
    if (error) setMessage("পণ্য যোগ হয়নি: " + error.message); else { setProductName(""); setPurchasePrice(""); setSalePrice(""); setInitialStock("0"); setThreshold("5"); setMessage("পণ্য যোগ হয়েছে।"); await loadAll(); }
    setLoading(false);
  }

  async function saveThreshold(p: Product, value: string) {
    const n = Number(value); if (value.trim() === "" || !Number.isInteger(n) || n < 0) { setMessage("সতর্কসীমা শূন্য বা তার বেশি পূর্ণসংখ্যা হতে হবে।"); return; }
    const { error } = await supabase.from("products").update({ low_stock_threshold: n }).eq("id", p.id);
    if (error) setMessage("সতর্কসীমা সেভ হয়নি: " + error.message); else { setMessage("সতর্কসীমা সেভ হয়েছে।"); await loadAll(); }
  }

  async function recordSale(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const id = Number(saleProductId), qty = Number(saleQty), disc = Number(discount); const p = products.find(x => x.id === id);
    if (!p) { setMessage("বিক্রির জন্য পণ্য নির্বাচন করো।"); return; }
    if (!Number.isInteger(qty) || qty < 1 || qty > p.stock || !Number.isFinite(disc) || disc < 0 || disc > qty * p.sale_price) { setMessage("পরিমাণ বা ছাড় সঠিক নয়। স্টক ও মোট দাম যাচাই করো।"); return; }
    setLoading(true); setMessage("বিক্রি সংরক্ষণ হচ্ছে...");
    const { data, error } = await supabase.rpc("record_sale", { p_product_id: id, p_quantity: qty, p_discount: disc });
    if (error) { setMessage("বিক্রি হয়নি: " + error.message); setLoading(false); return; }
    const receipt = { id: String((data as any)?.id ?? `AJ-${Date.now()}`), product: p.name, qty, unitPrice: p.sale_price, subtotal: qty * p.sale_price, discount: disc, total: qty * p.sale_price - disc, time: new Date().toISOString(), customer: customer.trim() || "সাধারণ ক্রেতা" };
    setLastReceipt(receipt); setCustomer(""); setSaleQty("1"); setDiscount("0"); setMessage("বিক্রি সফল হয়েছে। স্টক আপডেট করা হয়েছে।"); await loadAll(); setLoading(false);
  }

  async function recordPurchase(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const id = Number(restockId), qty = Number(restockQty), cost = Number(restockPrice); const p = products.find(x => x.id === id);
    if (!p || !Number.isInteger(qty) || qty < 1 || !Number.isFinite(cost) || cost < 0 || restockPrice.trim() === "") { setMessage("পণ্য, কেনার পরিমাণ ও একক ক্রয়মূল্য সঠিকভাবে দাও।"); return; }
    setLoading(true); setMessage("কেনাকাটা সংরক্ষণ হচ্ছে...");
    // Save purchase log first; expected columns: product_id, quantity, purchase_price, total_cost.
    const { error: purchaseError } = await supabase.from("purchases").insert({ product_id: id, quantity: qty, purchase_price: cost, total_cost: qty * cost });
    if (purchaseError) { setMessage("কেনাকাটার রেকর্ড সেভ হয়নি: " + purchaseError.message + " — purchases টেবিলের কলাম/নীতিমালা যাচাই করতে হবে।"); setLoading(false); return; }
    const { error: productError } = await supabase.from("products").update({ stock: p.stock + qty, purchase_price: cost }).eq("id", id);
    if (productError) { setMessage("কেনাকাটার রেকর্ড হয়েছে, কিন্তু স্টক আপডেট হয়নি: " + productError.message + ". পণ্যের স্টক হাতে যাচাই করো।"); setLoading(false); await loadAll(); return; }
    setRestockId(""); setRestockQty("1"); setRestockPrice(""); setMessage("কেনাকাটা যোগ হয়েছে এবং স্টক বেড়েছে।"); await loadAll(); setLoading(false);
  }

  async function addExpense(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const amount = Number(expenseAmount); if (!expenseDescription.trim() || expenseAmount.trim() === "" || !Number.isFinite(amount) || amount <= 0) { setMessage("খরচের বিবরণ এবং শূন্যের বেশি পরিমাণ লিখো।"); return; }
    setLoading(true); const { error } = await supabase.from("expenses").insert({ description: expenseDescription.trim(), amount });
    if (error) setMessage("খরচ সেভ হয়নি: " + error.message); else { setExpenseDescription(""); setExpenseAmount(""); setMessage("খরচ যোগ হয়েছে।"); await loadAll(); } setLoading(false);
  }
  async function deleteExpense(ex: Expense) {
    if (!window.confirm(`“${ex.description}” — ${money(num(ex.amount))} খরচটি মুছে ফেলবে?`)) return;
    setLoading(true); const { error } = await supabase.from("expenses").delete().eq("id", ex.id);
    if (error) setMessage("খরচ মুছতে সমস্যা: " + error.message + "। expenses টেবিলে DELETE RLS policy থাকতে হবে।"); else { setMessage("খরচ মুছে ফেলা হয়েছে।"); await loadAll(); } setLoading(false);
  }
  function printReceipt() { if (!lastReceipt) return; window.print(); }

  const filteredProducts = useMemo(() => products.filter(p => p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim())), [products, search]);
  const filteredSaleProducts = useMemo(() => products.filter(p => p.name.toLocaleLowerCase().includes(saleSearch.toLocaleLowerCase().trim()) && p.stock > 0), [products, saleSearch]);
  const totalStock = products.reduce((s, p) => s + num(p.stock), 0);
  const stockCost = products.reduce((s, p) => s + num(p.stock) * num(p.purchase_price), 0);
  const lowProducts = products.filter(p => p.stock > 0 && p.stock <= p.low_stock_threshold);
  const outProducts = products.filter(p => p.stock === 0);
  const totalExpenses = expenses.reduce((s, e) => s + num(e.amount), 0);
  const salesRevenue = sales.reduce((s, r) => s + num(r.total ?? r.total_amount ?? r.amount ?? r.sale_total), 0);
  const purchaseSpend = purchases.reduce((s, r) => s + num(r.total_cost ?? (num(r.quantity) * num(r.purchase_price))), 0);
  // Profit estimate only when sales rows contain usable product/quantity/total fields.
  const grossProfit = sales.reduce((sum, r) => {
    const p = products.find(x => x.id === Number(r.product_id));
    const qty = num(r.quantity ?? r.qty);
    const revenue = num(r.total ?? r.total_amount ?? r.amount ?? r.sale_total);
    return sum + (p && qty > 0 ? revenue - qty * num(p.purchase_price) : 0);
  }, 0);

  if (authLoading) return <main style={S.main}>লগইন অবস্থা যাচাই হচ্ছে...</main>;
  if (!user) return <main style={S.main}><h1>💄 AJ Cosmetics Shop</h1><p>তোমার ব্যক্তিগত ব্যবসার হিসাব</p><section style={S.card}><h2>🔐 লগইন</h2><form onSubmit={login} style={S.form}><label>ইমেইল</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={S.input}/><label>পাসওয়ার্ড</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={S.input}/><button disabled={loading} style={S.button}>{loading ? "অপেক্ষা করো..." : "লগইন"}</button></form><p>{message}</p></section></main>;

  return <main style={S.main}>
    <header style={S.header}><div><h1>💄 AJ Cosmetics Shop</h1><p>লগইন: {user.email}</p></div><div style={S.row}><button onClick={() => void loadAll()} style={S.secondary}>🔄 রিফ্রেশ</button><button onClick={() => void logout()} style={S.danger}>লগআউট</button></div></header>
    <nav style={S.nav}>{[["dashboard","📊 ড্যাশবোর্ড"],["products","📦 পণ্য ও স্টক"],["sale","🧾 বিক্রি"],["purchase","🛒 কেনাকাটা"],["expenses","💸 খরচ"],["history","📚 হিসাবের তালিকা"]].map(([id,label]) => <button key={id} onClick={() => setTab(id)} style={tab === id ? S.navActive : S.navButton}>{label}</button>)}</nav>
    {message && <p role="status" style={S.message}>{message}</p>}
    {tab === "dashboard" && <>
      <h2>📊 ব্যবসার ড্যাশবোর্ড</h2><div style={S.grid}>
        <Stat title="পণ্যের ধরন" value={String(products.length)} note="রকম"/><Stat title="মোট স্টক" value={String(totalStock)} note="পিস"/><Stat title="বর্তমান স্টকের ক্রয়মূল্য" value={money(stockCost)} note="মজুতের আনুমানিক মূল্য"/><Stat title="মোট খরচ" value={money(totalExpenses)} note="খরচের রেকর্ড"/><Stat title="বিক্রির মোট" value={money(salesRevenue)} note="বিক্রির রেকর্ড থেকে পাওয়া তথ্য"/><Stat title="কেনাকাটার মোট" value={money(purchaseSpend)} note="কেনাকাটার রেকর্ড"/><Stat title="কম স্টক" value={String(lowProducts.length)} note="পণ্য"/><Stat title="স্টক শেষ" value={String(outProducts.length)} note="পণ্য"/>
      </div><section style={S.card}><h3>📉 লাভ-ক্ষতির হিসাব (আনুমানিক)</h3><p>বিক্রির রেকর্ডে পণ্য ও পরিমাণ পাওয়া গেলে বর্তমান ক্রয়মূল্য ধরে আনুমানিক মোট লাভ: <b>{money(grossProfit)}</b></p><p>খরচ বাদে আনুমানিক: <b>{money(grossProfit - totalExpenses)}</b></p><small>নোট: পণ্যের ক্রয়মূল্য পরে বদলালে আগের বিক্রির লাভও ভুল হতে পারে। নির্ভুল ঐতিহাসিক লাভের জন্য sales টেবিলে বিক্রির সময়ের unit cost সংরক্ষণ দরকার।</small></section>
      {outProducts.length > 0 && <section style={S.alert}><h3>🚨 স্টক শেষ</h3>{outProducts.map(p => <p key={p.id}>{p.name} — ০ পিস</p>)}</section>}{lowProducts.length > 0 && <section style={S.warning}><h3>⚠️ কম স্টক</h3>{lowProducts.map(p => <p key={p.id}>{p.name}: {p.stock} পিস (সতর্কসীমা {p.low_stock_threshold})</p>)}</section>}
    </>}

    {tab === "products" && <>
      <section style={S.card}><h2>➕ নতুন পণ্য যোগ</h2><form onSubmit={addProduct} style={S.form}><label>পণ্যের নাম</label><input value={productName} onChange={e => setProductName(e.target.value)} required style={S.input} placeholder="যেমন: ফেসওয়াশ"/><label>প্রতি পিস ক্রয়মূল্য (৳)</label><input type="number" min="0" step="0.01" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} required style={S.input}/><label>প্রতি পিস বিক্রয়মূল্য (৳)</label><input type="number" min="0" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} required style={S.input}/><label>শুরুর স্টক (পিস)</label><input type="number" min="0" step="1" value={initialStock} onChange={e => setInitialStock(e.target.value)} required style={S.input}/><label>কম স্টকের সতর্কসীমা</label><input type="number" min="0" step="1" value={threshold} onChange={e => setThreshold(e.target.value)} required style={S.input}/><button disabled={loading} style={S.button}>পণ্য যোগ করো</button></form></section>
      <section style={S.card}><h2>📦 পণ্যের তালিকা ({filteredProducts.length})</h2><input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 পণ্যের নাম লিখে খুঁজো..." style={S.input}/><div style={S.scroll}><table style={S.table}><thead><tr>{["পণ্যের নাম","ক্রয়মূল্য","বিক্রয়মূল্য","স্টক","লাভ/পিস","সতর্কসীমা","অ্যাকশন"].map(x => <th key={x} style={S.cell}>{x}</th>)}</tr></thead><tbody>{filteredProducts.map(p => <tr key={p.id}><td style={S.cell}>{p.name}</td><td style={S.cell}>{money(p.purchase_price)}</td><td style={S.cell}>{money(p.sale_price)}</td><td style={S.cell}>{p.stock}</td><td style={S.cell}>{money(p.sale_price - p.purchase_price)}</td><td style={S.cell}><input aria-label={p.name + " সতর্কসীমা"} type="number" min="0" step="1" defaultValue={p.low_stock_threshold} id={`threshold-${p.id}`} style={{...S.input,width:90}}/><button style={S.small} onClick={() => { const el = document.getElementById(`threshold-${p.id}`) as HTMLInputElement | null; if (el) void saveThreshold(p, el.value); }}>সেভ</button></td><td style={S.cell}>{p.stock === 0 ? "🚨 স্টক শেষ" : p.stock <= p.low_stock_threshold ? "⚠️ কম" : "✅ পর্যাপ্ত"}</td></tr>)}{filteredProducts.length === 0 && <tr><td style={S.cell} colSpan={7}>কোনো পণ্য পাওয়া যায়নি।</td></tr>}</tbody></table></div></section>
    </>}

    {tab === "sale" && <><section style={S.card}><h2>🧾 পণ্য বিক্রি</h2><p>পণ্য খুঁজে নির্বাচন করো; বিক্রি সফল হলে Supabase-এর record_sale ফাংশন স্টক কমাবে।</p><form onSubmit={recordSale} style={S.form}><label>পণ্য খুঁজো</label><input value={saleSearch} onChange={e => setSaleSearch(e.target.value)} placeholder="পণ্যের নাম লিখো..." style={S.input}/><label>পণ্য নির্বাচন</label><select value={saleProductId} onChange={e => setSaleProductId(e.target.value)} required style={S.input}><option value="">পণ্য নির্বাচন করো</option>{filteredSaleProducts.map(p => <option key={p.id} value={p.id}>{p.name} — স্টক {p.stock} — {money(p.sale_price)}</option>)}</select><label>পরিমাণ (পিস)</label><input type="number" min="1" step="1" value={saleQty} onChange={e => setSaleQty(e.target.value)} required style={S.input}/><label>ছাড় (মোট টাকা)</label><input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(e.target.value)} required style={S.input}/><label>ক্রেতার নাম (ঐচ্ছিক)</label><input value={customer} onChange={e => setCustomer(e.target.value)} style={S.input}/>{(() => { const p = products.find(x => x.id === Number(saleProductId)); const total = p ? Math.max(0, num(saleQty) * p.sale_price - num(discount)) : 0; return <p><b>মোট: {money(total)}</b></p>; })()}<button disabled={loading} style={S.button}>বিক্রি নিশ্চিত করো</button></form></section>
      {lastReceipt && <section id="receipt" style={S.receipt}><h2>🧾 AJ Cosmetics Shop — বিক্রির রসিদ</h2><p>রসিদ: {lastReceipt.id}</p><p>তারিখ: {dateText(lastReceipt.time)}</p><p>ক্রেতা: {lastReceipt.customer}</p><hr/><p>পণ্য: {lastReceipt.product}</p><p>পরিমাণ: {lastReceipt.qty} পিস × {money(lastReceipt.unitPrice)}</p><p>সাবটোটাল: {money(lastReceipt.subtotal)}</p><p>ছাড়: {money(lastReceipt.discount)}</p><h3>মোট: {money(lastReceipt.total)}</h3><button onClick={printReceipt} style={S.button}>🖨️ রসিদ প্রিন্ট</button></section>}</>}

    {tab === "purchase" && <section style={S.card}><h2>🛒 নতুন কেনাকাটা / স্টক বাড়ানো</h2><form onSubmit={recordPurchase} style={S.form}><label>পণ্য নির্বাচন</label><select value={restockId} onChange={e => { setRestockId(e.target.value); const p = products.find(x => x.id === Number(e.target.value)); setRestockPrice(p ? String(p.purchase_price) : ""); }} required style={S.input}><option value="">পণ্য নির্বাচন করো</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} — বর্তমান স্টক {p.stock}</option>)}</select><label>কেনা পরিমাণ (পিস)</label><input type="number" min="1" step="1" value={restockQty} onChange={e => setRestockQty(e.target.value)} required style={S.input}/><label>প্রতি পিস ক্রয়মূল্য (৳)</label><input type="number" min="0" step="0.01" value={restockPrice} onChange={e => setRestockPrice(e.target.value)} required style={S.input}/><p>মোট কেনাকাটা: {money(num(restockQty) * num(restockPrice))}</p><button disabled={loading} style={S.button}>কেনাকাটা সেভ ও স্টক বাড়াও</button></form><p style={S.note}>এই অংশ purchases টেবিলে product_id, quantity, purchase_price, total_cost কলাম ধরে কাজ করে। টেবিলের কলাম আলাদা হলে Supabase-এর ত্রুটি অনুযায়ী সেটি ঠিক করতে হবে।</p></section>}

    {tab === "expenses" && <><section style={S.card}><h2>➕ নতুন খরচ যোগ</h2><form onSubmit={addExpense} style={S.form}><label>খরচের বিবরণ</label><input value={expenseDescription} onChange={e => setExpenseDescription(e.target.value)} required style={S.input} placeholder="যেমন: দোকান ভাড়া"/><label>পরিমাণ (৳)</label><input type="number" min="0.01" step="0.01" value={expenseAmount} onChange={e => setExpenseAmount(e.target.value)} required style={S.input}/><button disabled={loading} style={S.button}>খরচ সেভ করো</button></form></section><section style={S.card}><h2>💸 খরচের তালিকা — মোট {money(totalExpenses)}</h2><div style={S.scroll}><table style={S.table}><thead><tr><th style={S.cell}>তারিখ</th><th style={S.cell}>বিবরণ</th><th style={S.cell}>পরিমাণ</th><th style={S.cell}>অ্যাকশন</th></tr></thead><tbody>{expenses.map(ex => <tr key={ex.id}><td style={S.cell}>{dateText(ex.created_at)}</td><td style={S.cell}>{ex.description}</td><td style={S.cell}>{money(ex.amount)}</td><td style={S.cell}><button disabled={loading} onClick={() => void deleteExpense(ex)} style={S.danger}>🗑️ মুছুন</button></td></tr>)}{expenses.length === 0 && <tr><td style={S.cell} colSpan={4}>এখনো কোনো খরচ যোগ করা হয়নি।</td></tr>}</tbody></table></div></section></>}

    {tab === "history" && <><section style={S.card}><h2>📚 বিক্রির রেকর্ড (সর্বশেষ ৫০০)</h2><div style={S.scroll}><table style={S.table}><thead><tr><th style={S.cell}>তারিখ</th><th style={S.cell}>পণ্যের আইডি</th><th style={S.cell}>পরিমাণ</th><th style={S.cell}>মোট/প্রাপ্ত টাকা</th><th style={S.cell}>ছাড়</th></tr></thead><tbody>{sales.map((r,i) => <tr key={String(r.id ?? i)}><td style={S.cell}>{dateText(r.created_at)}</td><td style={S.cell}>{String(r.product_id ?? "—")}</td><td style={S.cell}>{num(r.quantity ?? r.qty) || "—"}</td><td style={S.cell}>{money(num(r.total ?? r.total_amount ?? r.amount ?? r.sale_total))}</td><td style={S.cell}>{money(num(r.discount))}</td></tr>)}{sales.length === 0 && <tr><td style={S.cell} colSpan={5}>এখনো কোনো বিক্রির রেকর্ড পাওয়া যায়নি।</td></tr>}</tbody></table></div></section><section style={S.card}><h2>🛒 কেনাকাটার রেকর্ড (সর্বশেষ ৫০০)</h2><div style={S.scroll}><table style={S.table}><thead><tr><th style={S.cell}>তারিখ</th><th style={S.cell}>পণ্যের আইডি</th><th style={S.cell}>পরিমাণ</th><th style={S.cell}>একক ক্রয়মূল্য</th><th style={S.cell}>মোট</th></tr></thead><tbody>{purchases.map((r,i) => <tr key={String(r.id ?? i)}><td style={S.cell}>{dateText(r.created_at)}</td><td style={S.cell}>{String(r.product_id ?? "—")}</td><td style={S.cell}>{num(r.quantity) || "—"}</td><td style={S.cell}>{money(num(r.purchase_price))}</td><td style={S.cell}>{money(num(r.total_cost ?? num(r.quantity) * num(r.purchase_price)))}</td></tr>)}{purchases.length === 0 && <tr><td style={S.cell} colSpan={5}>এখনো কেনাকাটার রেকর্ড পাওয়া যায়নি।</td></tr>}</tbody></table></div></section></>}
    <footer style={S.footer}>AJ Cosmetics Shop · ব্যক্তিগত স্টক ও হিসাব · Supabase</footer>
    <style jsx global>{`@media print { body * { visibility: hidden; } #receipt, #receipt * { visibility: visible; } #receipt { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; } #receipt button { display: none; } }`}</style>
  </main>;
}

function Stat({ title, value, note }: { title: string; value: string; note: string }) { return <section style={S.stat}><h3>{title}</h3><strong style={{fontSize:22}}>{value}</strong><p>{note}</p></section>; }
const S: Record<string, React.CSSProperties> = {
  main:{maxWidth:1200,margin:"0 auto",padding:20,fontFamily:"Arial, sans-serif",color:"#222"}, header:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}, row:{display:"flex",gap:8,flexWrap:"wrap"}, nav:{display:"flex",gap:8,flexWrap:"wrap",margin:"18px 0"}, navButton:{padding:"10px 13px",border:"1px solid #ccc",borderRadius:8,background:"#fff",cursor:"pointer"}, navActive:{padding:"10px 13px",border:"1px solid #087f5b",borderRadius:8,background:"#087f5b",color:"white",cursor:"pointer"}, grid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:14}, stat:{background:"#f1f8f5",border:"1px solid #d6e8df",borderRadius:12,padding:18}, card:{background:"#fff",border:"1px solid #ddd",borderRadius:12,padding:20,marginTop:20,boxShadow:"0 2px 8px #0000000d"}, form:{display:"grid",gap:9,maxWidth:480}, input:{width:"100%",boxSizing:"border-box",padding:11,border:"1px solid #bbb",borderRadius:7,marginTop:4,marginBottom:6,fontSize:16}, button:{padding:12,background:"#087f5b",color:"white",border:0,borderRadius:7,cursor:"pointer",marginTop:8}, secondary:{padding:10,background:"#eef2f6",color:"#222",border:"1px solid #ccd",borderRadius:7,cursor:"pointer"}, small:{padding:7,background:"#087f5b",color:"white",border:0,borderRadius:6,cursor:"pointer",marginLeft:5}, danger:{padding:10,background:"#b42318",color:"white",border:0,borderRadius:7,cursor:"pointer"}, table:{width:"100%",borderCollapse:"collapse",marginTop:12}, cell:{border:"1px solid #ddd",padding:9,textAlign:"left",whiteSpace:"nowrap"}, scroll:{overflowX:"auto"}, message:{background:"#eef7ff",border:"1px solid #b6d8f2",borderRadius:8,padding:12}, alert:{background:"#fff0f0",border:"1px solid #d33",borderRadius:12,padding:16,marginTop:18,color:"#a00"}, warning:{background:"#fff7e6",border:"1px solid #e5a000",borderRadius:12,padding:16,marginTop:18,color:"#805400"}, receipt:{background:"white",border:"1px dashed #666",borderRadius:8,padding:20,marginTop:20,maxWidth:500}, note:{background:"#fff7e6",padding:12,borderRadius:8}, footer:{padding:20,textAlign:"center",color:"#777"}
};
