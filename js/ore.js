/* Ore in formato centesimale: 1.30 = 1h 30min.
   Port fedele di ore_utils.py (gestisce negativi e correzioni floating). */
(function (global) {
  "use strict";

  function parseMin(oreStr) {
    var ore = parseFloat(String(oreStr).replace(",", "."));
    if (isNaN(ore)) return 0;
    var neg = ore < 0;
    ore = Math.abs(ore);
    var hh = Math.trunc(ore);
    var mm = Math.round((ore - hh) * 100); // 0.2999.. -> 30
    if (mm >= 60) { hh += Math.trunc(mm / 60); mm = mm % 60; }
    var tot = hh * 60 + mm;
    return neg ? -tot : tot;
  }

  function fromMin(minuti) {
    var neg = minuti < 0;
    minuti = Math.abs(Math.round(minuti));
    var hh = Math.trunc(minuti / 60);
    var mm = minuti % 60;
    var res = hh + mm / 100;
    return neg ? -res : res;
  }

  function somma_ore(o1, o2) { return fromMin(parseMin(o1) + parseMin(o2)); }
  function sottrai_ore(o1, o2) { return fromMin(parseMin(o1) - parseMin(o2)); }

  function format_ore(oreFloat) {
    var raw = String(oreFloat);
    var ore = parseFloat(raw.replace(",", "."));
    if (isNaN(ore)) return "–"; // –
    if (ore === 0 && (raw === "0" || raw === "0.0" || raw === "None" || raw === "")) return "0:00";
    var neg = ore < 0;
    ore = Math.abs(ore);
    var hh = Math.trunc(ore);
    var mm = Math.round((ore - hh) * 100);
    if (mm >= 60) { hh += 1; mm = 0; }
    var s = hh + ":" + String(mm).padStart(2, "0");
    return neg ? "-" + s : s;
  }

  function ore_to_float(oreStr) {
    var v = parseFloat(String(oreStr).replace(",", "."));
    return isNaN(v) ? 0.0 : v;
  }

  global.Ore = { somma_ore: somma_ore, sottrai_ore: sottrai_ore,
                 format_ore: format_ore, ore_to_float: ore_to_float };
})(window);
