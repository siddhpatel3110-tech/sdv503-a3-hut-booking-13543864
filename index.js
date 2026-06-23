// Great Walks Hut Booking Manager – Single File, VS Code Friendly
// ---------------------------------------------------------------
// No external packages. Pure Node.js. Fully runnable.

const fs = require('fs');
const readline = require('readline');

// ---------------------- Persistence ----------------------

const DATA_PATH = './data.json';

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      huts: parsed.huts ?? [],
      bookings: parsed.bookings ?? []
    };
  } catch {
    console.log('Data file missing or corrupt — starting fresh.');
    return { huts: [], bookings: [] };
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------- CLI Input ----------------------

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(q) {
  return new Promise(res => rl.question(q, ans => res(ans)));
}

// ---------------------- Helpers ----------------------

function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));

  // Convert back to local date without timezone shift
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}


// ---------------------- Validation ----------------------

function validateBookingInput({ name, hut, arrivalDate, nights, partySize }) {
  if (!name || name.trim() === '') return 'Tramper name cannot be empty.';
  if (!hut) return 'Selected hut does not exist.';

  const date = parseDate(arrivalDate.trim());
if (!date) return 'Invalid date format.';

// Fix: compare only Y/M/D, not time
const today = new Date();
const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

if (date.getTime() < todayOnly.getTime()) {
  return 'Arrival date is in the past.';
}

  if (!Number.isInteger(nights) || nights <= 0)
    return 'Nights must be a positive whole number.';
  if (!Number.isInteger(partySize) || partySize <= 0)
    return 'Party size must be a positive whole number.';

  return null;
}

// ---------------------- Capacity Logic ----------------------

function bookingFits(newBooking, hut, allBookings) {
  const arrival = parseDate(newBooking.arrivalDate);

  for (let i = 0; i < newBooking.nights; i++) {
    const night = new Date(arrival);
    night.setDate(night.getDate() + i);

    let occupied = 0;

    for (const b of allBookings) {
      if (b.hutId !== hut.id) continue;

      const start = parseDate(b.arrivalDate);
      const end = new Date(start);
      end.setDate(end.getDate() + b.nights - 1);

      if (night >= start && night <= end) {
        occupied += b.partySize;
      }
    }

    if (occupied + newBooking.partySize > hut.capacity) {
      return { ok: false, night };
    }
  }

  return { ok: true };
}

// ---------------------- Menu Actions ----------------------

async function createBooking(data) {
  const name = await ask('Tramper name: ');
  const hutName = await ask('Hut: ');
  const arrivalDate = await ask('Arrival date (YYYY-MM-DD): ');
  const nights = Number(await ask('Nights: '));
  const partySize = Number(await ask('Party size: '));

  const hut = data.huts.find(h => h.name === hutName);

  const error = validateBookingInput({ name, hut, arrivalDate, nights, partySize });
  if (error) return console.log(error);

  const newBooking = {
    id: generateId(),
    hutId: hut.id,
    tramperName: name,
    arrivalDate,
    nights,
    partySize
  };

  const fit = bookingFits(newBooking, hut, data.bookings);
  if (!fit.ok) {
    const d = fit.night.toISOString().slice(0, 10);
    return console.log('Booking rejected — capacity exceeded on ' + d);
  }

  data.bookings.push(newBooking);
  saveData(data);
  console.log('Booking confirmed.');
}

async function cancelBooking(data) {
  const id = await ask('Booking ID to cancel: ');
  const index = data.bookings.findIndex(b => b.id === id);

  if (index === -1) return console.log('No booking found with that ID.');

  data.bookings.splice(index, 1);
  saveData(data);
  console.log('Booking cancelled.');
}

async function viewBookingsForDate(data) {
  const hutName = await ask('Hut: ');
  const dateStr = await ask('Date (YYYY-MM-DD): ');

  const hut = data.huts.find(h => h.name === hutName);
  if (!hut) return console.log('Hut not found.');

  const date = parseDate(dateStr);
  if (!date) return console.log('Invalid date.');

  const bookings = data.bookings.filter(b => {
    if (b.hutId !== hut.id) return false;
    const start = parseDate(b.arrivalDate);
    const end = new Date(start);
    end.setDate(end.getDate() + b.nights - 1);
    return date >= start && date <= end;
  });

  const occupied = bookings.reduce((s, b) => s + b.partySize, 0);
  const remaining = hut.capacity - occupied;

  console.log('\nBookings for ' + hut.name + ' on ' + dateStr + ':');
  bookings.forEach(b =>
    console.log(' - ' + b.tramperName + ' (' + b.partySize + ')')
  );
  console.log('Remaining capacity: ' + remaining + '\n');
}

function occupancySummary(data) {
  console.log('\n=== Occupancy Summary ===');

  for (const hut of data.huts) {
    const nightsMap = new Map();

    for (const b of data.bookings.filter(x => x.hutId === hut.id)) {
      const start = parseDate(b.arrivalDate);
      for (let i = 0; i < b.nights; i++) {
        const night = new Date(start);
        night.setDate(night.getDate() + i);
        const key = night.toISOString().slice(0, 10);
        nightsMap.set(key, (nightsMap.get(key) || 0) + b.partySize);
      }
    }

    console.log('\n' + hut.name + ':');
    for (const [date, occ] of nightsMap.entries()) {
      const pct = ((occ / hut.capacity) * 100).toFixed(0);
      console.log(' ' + date + ': ' + occ + '/' + hut.capacity + ' (' + pct + '%)');
    }
  }

  console.log('');
}

// ---------------------- Main Menu Loop ----------------------

async function main() {
  const data = loadData();

 if (!data.huts || data.huts.length === 0) {
  data.huts = [
    { id: generateId(), name: 'Mintaro Hut', walk: 'Milford Track', capacity: 40 },
    { id: generateId(), name: 'Routeburn Falls Hut', walk: 'Routeburn Track', capacity: 48 }
  ];
  saveData(data);
}

  while (true) {
    console.log(`
=== DOC Great Walks Booking Manager ===
1) Create booking
2) View bookings for hut/date
3) Cancel booking
4) Occupancy summary
5) Exit
`);

    const choice = await ask('Choose an option: ');

    if (choice === '1') await createBooking(data);
    else if (choice === '2') await viewBookingsForDate(data);
    else if (choice === '3') await cancelBooking(data);
    else if (choice === '4') occupancySummary(data);
    else if (choice === '5') break;
    else console.log('Invalid option.');
  }

  rl.close();
}

main();
