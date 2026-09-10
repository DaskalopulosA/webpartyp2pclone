export const COLORS = ['#fffffa', '#ed6845', '#eac65b', '#9ebb75', '#72aeb2', '#9283b8'];
export const CELL_COUNT = 96;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 64;
const validCell = cell => Array.isArray(cell) && cell.length === 3 && Number.isInteger(cell[0]) && cell[0] >= 0 && cell[0] < COLORS.length && Number.isSafeInteger(cell[1]) && cell[1] >= 0 && (cell[1] === 0 ? cell[2] === '' : validId(cell[2]));
const newer = (a, b) => a[1] > b[1] || (a[1] === b[1] && a[2] > b[2]);

// One Lamport timestamp per cell. Concurrent edits converge without a host.
export function createPixels(selfId, send, changed) {
  let clock = 0;
  const cells = Array.from({ length: CELL_COUNT }, () => [0, 0, '']);
  function merge(index, cell) {
    clock = Math.max(clock, cell[1]);
    if (!newer(cell, cells[index])) return false;
    cells[index] = [...cell];
    return true;
  }
  return {
    cells,
    paint(index, color) {
      if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT || !Number.isInteger(color) || color < 0 || color >= COLORS.length || clock >= Number.MAX_SAFE_INTEGER) return;
      const cell = [color, ++clock, selfId];
      merge(index, cell); send('paint', { index, cell }); changed();
    },
    clear() {
      if (clock >= Number.MAX_SAFE_INTEGER) return;
      const stamp = ++clock;
      cells.forEach((_, i) => { cells[i] = [0, stamp, selfId]; });
      send('snapshot', cells); changed();
    },
    sync(peerId) { send('snapshot', cells, peerId); },
    receive(type, data, sender) {
      if (type === 'paint') {
        if (!data || !Number.isInteger(data.index) || data.index < 0 || data.index >= CELL_COUNT || !validCell(data.cell) || data.cell[2] !== sender) return;
        if (merge(data.index, data.cell)) changed();
      } else if (type === 'snapshot' && Array.isArray(data) && data.length === CELL_COUNT && data.every(validCell)) {
        let updated = false;
        data.forEach((cell, i) => { if (merge(i, cell)) updated = true; });
        if (updated) changed();
      }
    },
  };
}
