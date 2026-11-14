// Проверка модов в сборке: зависимости, дубликаты, конфликты, неподходящие загрузчик и версия игры.
const fs = require('fs');
const path = require('path');
const local = require('./local');
const instances = require('./instances');
const modrinth = require('./modrinth');

const BUILTIN = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'fabric', 'quilt_loader', 'quilt-loader', 'quilt_base', 'forge', 'neoforge', 'mixinextras']);

// ---- сравнение версий и диапазонов ----
function parseV(s) {
  const m = String(s).match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

function comparator(tok, v) {
  tok = tok.trim();
  if (!tok || tok === '*') return true;
  const m = /^(>=|<=|>|<|=|\^|~)?\s*(.+)$/.exec(tok);
  const op = m[1] || '';
  const ver = m[2];
  const parts = ver.split('.');
  const partial = parts.length < 3 || parts.some((p) => /^[xX*]$/.test(p));
  const base = parseV(parts.map((p) => (/^[xX*]$/.test(p) ? '0' : p)).join('.'));
  if (!base) return true;
  if (!op && partial) {
    const fixed = parts.filter((p) => !/^[xX*]$/.test(p)).length;
    return base.slice(0, fixed).every((n, i) => n === v[i]);
  }
  const c = cmp(v, base);
  if (op === '>=') return c >= 0;
  if (op === '<=') return partial ? cmp(v, [base[0], base[1] + 1, 0]) < 0 : c <= 0;
  if (op === '>') return partial ? cmp(v, [base[0], base[1] + 1, 0]) >= 0 : c > 0;
  if (op === '<') return c < 0;
  if (op === '^') return c >= 0 && v[0] === base[0] && (base[0] !== 0 || v[1] === base[1]);
  if (op === '~') return c >= 0 && v[0] === base[0] && v[1] === base[1];
  return c === 0;
}

function satisfies(range, mcVersion) {
  const v = parseV(mcVersion);
  if (!v || !range) return true; // снапшоты и неизвестные форматы не проверяем
  const ranges = Array.isArray(range) ? range : [range];
  return ranges.some((r) => {
    const s = String(r).trim();
    const maven = /^([\[(])\s*([^,\])]*)\s*(?:,\s*([^\])]*))?\s*([\])])$/.exec(s);
    if (maven) {
      const lo = parseV(maven[2]);
      const hi = maven[3] === undefined ? lo : parseV(maven[3] || '');
      if (maven[3] === undefined) return !lo || cmp(v, lo) === 0;
      if (lo && (maven[1] === '[' ? cmp(v, lo) < 0 : cmp(v, lo) <= 0)) return false;
      if (hi && maven[3] !== '' && (maven[4] === ']' ? cmp(v, hi) > 0 : cmp(v, hi) >= 0)) return false;
      return true;
    }
    return s.split('||').some((alt) => alt.trim().split(/\s+/).every((t) => comparator(t, v)));
  });
}

async function analyze(id) {
  const inst = instances.get(id);
  const dir = path.join(instances.dirOf(id), 'mods');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => /\.jar$/i.test(n));
  } catch {
    /* папки mods ещё нет */
  }
  const mods = names.map((file) => ({ file, ...local.readJarMeta(path.join(dir, file)) }));
  const provided = new Map();
  for (const m of mods) for (const i of m.ids) provided.set(i, [...(provided.get(i) || []), m]);
  const hasFabricApi = provided.has('fabric-api') || provided.has('fabric');
  const issues = [];
  const known = (inst.content || {});
  const titleOf = (m) => (known[m.file] && known[m.file].title) || m.name || m.file.replace(/\.jar$/i, '');

  for (const m of mods) {
    if (!m.loader) continue;
    const title = titleOf(m);
    const ok = m.loader === inst.loader || (inst.loader === 'quilt' && m.loader === 'fabric');
    if (inst.loader && inst.loader !== 'vanilla' && !ok) {
      issues.push({ severity: 'error', kind: 'loader', mod: title, file: m.file, text: `Мод сделан для ${m.loader}, а сборка использует ${inst.loader}. Игра может не запуститься.` });
      continue;
    }
    if (m.mcRange && !satisfies(m.mcRange, inst.version)) {
      issues.push({ severity: 'warn', kind: 'version', mod: title, file: m.file, text: `Рассчитан на Minecraft ${Array.isArray(m.mcRange) ? m.mcRange.join(' или ') : m.mcRange}, а в сборке ${inst.version}.` });
    }
    for (const dep of m.depends) {
      if (BUILTIN.has(dep) || provided.has(dep)) continue;
      if (hasFabricApi && /^fabric-/.test(dep)) continue;
      issues.push({ severity: 'error', kind: 'missing', mod: title, file: m.file, text: `Нужен мод «${dep}», но он не установлен.`, fix: { modid: dep } });
    }
    for (const b of m.breaks) {
      if (provided.has(b) && !provided.get(b).includes(m)) issues.push({ severity: 'warn', kind: 'conflict', mod: title, file: m.file, text: `Заявлена несовместимость с модом «${b}», который тоже установлен.` });
    }
  }
  for (const [mid, list] of provided) {
    const uniq = [...new Set(list.map((m) => m.file))];
    if (uniq.length > 1 && list.some((m) => m.id === mid)) {
      issues.push({ severity: 'error', kind: 'duplicate', mod: mid, file: uniq[0], text: `Мод «${mid}» установлен дважды: ${uniq.join(', ')}. Оставьте один файл.` });
    }
  }
  const order = { error: 0, warn: 1 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { issues, checked: mods.length, loader: inst.loader, version: inst.version };
}

async function installDependency(instanceId, modid) {
  const inst = instances.get(instanceId);
  let proj;
  try {
    proj = await modrinth.project(modid);
  } catch {
    const res = await modrinth.search({ query: modid, type: 'mod', gameVersion: inst.version, loader: inst.loader, limit: 5 });
    const hit = res.hits.find((h) => h.slug === modid || h.slug === modid.replace(/_/g, '-')) || null;
    if (!hit) throw new Error(`Не нашёл «${modid}» на Modrinth. Попробуйте найти его в каталоге вручную.`);
    proj = await modrinth.project(hit.project_id);
  }
  if (proj.project_type !== 'mod') throw new Error(`«${modid}» на Modrinth не является модом`);
  return modrinth.install(instanceId, proj.id);
}

module.exports = { analyze, installDependency, satisfies };
