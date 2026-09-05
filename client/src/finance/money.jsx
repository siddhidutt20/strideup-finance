import { useState } from "react";
import { api } from "../api.js";
import { IncomeView } from "./income.jsx";
import { ExpensesView } from "./expenses.jsx";
import { TransactionsView } from "./transactions.jsx";

// ── Money ────────────────────────────────────────────────────
// One page for everything that moved this month, because the four pages this
// replaces were reading the same ledger and disagreeing only about which
// columns to show. Income, Spending and Transactions are three questions
// about one set of rows, not three sets of rows.
//
// The tab bar lives here so nothing inside carries its own. Two rows of tabs,
// one nested in the other, is what a merge is supposed to remove.

const TABS = [
  ["overview", "Overview"],
  ["income", "Income"],
  ["spending", "Spending"],
  ["transactions", "Transactions"],
  ["trends", "Trends"],
];

export function MoneyView({ ex, inc, money, period, entity, categories, currency,
                            books, leftover, onGo, onAdd, onUpload, onChanged,
                            onBooksDone }) {
  const [tab, setTab] = useState("overview");
  const [addingSource, setAddingSource] = useState(false);

  return (
    <div className="mo">
      <div className="hh-tabs">
        <span className="fin-scope hh-tabrow">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </span>
        <span className="fin-scope">
          <a className="fin-link" href={api.finExportUrl()}>Export CSV</a>
          <button className="fin-btn ghost" onClick={onUpload}>Upload</button>
          <button className="fin-btn" onClick={onAdd}>+ Add</button>
        </span>
      </div>

      {tab === "income" ? (
        inc ? (
          <IncomeView inc={inc} money={money} period={period} entity={entity}
                      categories={categories} currency={currency}
                      adding={addingSource}
                      onAdd={() => setAddingSource(true)}
                      onCloseAdd={() => setAddingSource(false)}
                      onChanged={onChanged} />
        ) : <div className="fin-boot"><div className="fin-spinner" /></div>
      ) : tab === "transactions" ? (
        <TransactionsView entity={entity} categories={categories} money={money}
                          period={period} showDocs showScope
                          books={books} leftover={leftover} onBooksDone={onBooksDone}
                          onAdd={onAdd} onChanged={onChanged} />
      ) : ex ? (
        <ExpensesView ex={ex} money={money} period={period} entity={entity}
                      currency={currency} section={tab}
                      onGo={onGo} onChanged={onChanged} />
      ) : <div className="fin-boot"><div className="fin-spinner" /></div>}
    </div>
  );
}
