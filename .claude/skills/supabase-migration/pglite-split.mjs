export function splitSql(sql) {
  const out = []; let cur = ""; let i = 0; const n = sql.length;
  while (i < n) {
    const c = sql[i], c2 = sql.slice(i, i + 2);
    if (c2 === "--") { const j = sql.indexOf("\n", i); const e = j < 0 ? n : j; cur += sql.slice(i, e); i = e; continue; }
    if (c2 === "/*") { const j = sql.indexOf("*/", i + 2); const e = j < 0 ? n : j + 2; cur += sql.slice(i, e); i = e; continue; }
    if (c === "'") { let j = i + 1; while (j < n) { if (sql[j] === "'" && sql[j + 1] === "'") j += 2; else if (sql[j] === "'") break; else j++; } cur += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === '"') { const j = sql.indexOf('"', i + 1); cur += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === "$") { const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i)); if (m) { const tag = m[0]; const j = sql.indexOf(tag, i + tag.length); const e = j < 0 ? n : j + tag.length; cur += sql.slice(i, e); i = e; continue; } }
    if (c === ";") { if (cur.trim()) out.push(cur + ";"); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((s) => s.replace(/--[^\n]*/g, "").trim());
}
