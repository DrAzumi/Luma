const { spawn } = require('child_process');
const path = require('path');
const SCRIPT = path.join(__dirname, 'set_bulb.py');
function lanSet(bulbId, params) {
  const args = [SCRIPT, bulbId];
  if (params.power === false) { args.push('--power', 'off'); }
  else {
    if (params.power === true) args.push('--power', 'on');
    if (params.color) {
      args.push('--hue', String(Math.round(params.color.h)));
      args.push('--sat', String(Math.round(params.color.s ?? 1000)));
      args.push('--val', String(Math.round(params.color.v ?? 1000)));
    } else {
      if (params.brightness !== undefined) args.push('--brightness', String(Math.max(10, Math.min(1000, Math.round(params.brightness)))));
      if (params.colorTemp  !== undefined) args.push('--temp',       String(Math.max(0,  Math.min(1000, Math.round(params.colorTemp)))));
    }
  }
  const proc = spawn('python3', args, { stdio: 'pipe' });
  proc.stderr.on('data', d => console.log(`[LAN] ${bulbId}: ${d.toString().trim()}`));
}
function lanSetMany(bulbIds, params) { bulbIds.forEach(id => lanSet(id, params)); }
module.exports = { lanSet, lanSetMany };
