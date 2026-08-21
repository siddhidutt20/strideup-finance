// Cookies (session + CSRF) ride along automatically. For mutating requests we
// echo the CSRF cookie back in a header — the double-submit pattern.

function getCookie(name) {
  const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (method !== "GET") {
    const csrf = getCookie("sf_csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  }
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request("GET", "/auth/me"),
  login: (b) => request("POST", "/auth/login", b),
  logout: () => request("POST", "/auth/logout", {}),

  finOverview: (period, entity) =>
    request("GET", `/finance/overview?period=${period}&entity=${entity}`),
  finCategories: () => request("GET", "/finance/categories"),
  finStatements: (period, entity) =>
    request("GET", `/finance/statements?period=${period}&entity=${entity}`),
  finEntries: (q = "") => request("GET", `/finance/entries${q}`),
  finUpload: (b) => request("POST", "/finance/documents", b),
  finDeleteEntry: (id) => request("DELETE", `/finance/entries/${id}`),
  finPatchEntry: (id, b) => request("PATCH", `/finance/entries/${id}`, b),
  finAddEntry: (b) => request("POST", "/finance/entries", b),
  finImportGhl: (csv) => request("POST", "/finance/import/ghl", { csv }),
  finClosePeriod: (period, entity, reopen) =>
    request("POST", "/finance/periods/close", { period, entity, reopen }),
  finForecast: (entity, months = 6) =>
    request("GET", `/finance/forecast?entity=${entity}&months=${months}`),
  finCommitments: (entity) =>
    request("GET", `/finance/commitments?entity=${entity}`),
  finSchedule: (entity, period) =>
    request("GET", `/finance/schedule?entity=${entity}&period=${period}`),
  markPaid: (id, b) => request("POST", `/finance/commitments/${id}/payments`, b),
  unmarkPaid: (id, dueDate) =>
    request("DELETE", `/finance/commitments/${id}/payments/${dueDate}`),
  finDue: (entity, days = 30) =>
    request("GET", `/finance/due?entity=${entity}&days=${days}`),
  addCommitment: (b) => request("POST", "/finance/commitments", b),
  deleteCommitment: (id) => request("DELETE", `/finance/commitments/${id}`),
  finInvoices: (entity) => request("GET", `/finance/invoices?entity=${entity}`),
  addInvoice: (b) => request("POST", "/finance/invoices", b),
  payInvoice: (id, b) => request("POST", `/finance/invoices/${id}/payments`, b),
  deleteInvoice: (id) => request("DELETE", `/finance/invoices/${id}`),
  finSide: (direction, entity, period) =>
    request("GET", `/finance/side/${direction}?entity=${entity}&period=${period}`),
  finDashboard: (entity) => request("GET", `/finance/dashboard?entity=${entity}`),
  finCash: (entity, months = 3) =>
    request("GET", `/finance/cash?entity=${entity}&months=${months}`),
  finVendors: (entity) => request("GET", `/finance/vendors?entity=${entity}`),
  vendorExportUrl: (entity) => `/api/finance/vendors/export.csv?entity=${entity}`,
  rereadDoc: (id, b) => request("POST", `/finance/documents/${id}/reread`, b || {}),
  finDocUrl: (id) => `/api/finance/documents/${id}`,
  finExportUrl: () => "/api/finance/export.csv",
};
