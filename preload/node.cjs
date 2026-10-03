'use strict';
// jetlag clock preload for Node.js, loaded through NODE_OPTIONS=--require.
//
// It moves the wall clock of this process, its worker threads, and every vm
// context it creates (Jest runs each test file in one) to JETLAG_NOW. Time
// keeps flowing from there: timers, durations, and performance.now() are
// untouched. All processes in one run share JETLAG_EPOCH, so a test runner
// and its workers agree on what time it is.

(function jetlag() {
  const target = Date.parse(process.env.JETLAG_NOW || '');
  const epoch = Number(process.env.JETLAG_EPOCH);
  if (!Number.isFinite(target) || !Number.isFinite(epoch)) return;
  if (globalThis.Date && globalThis.Date.__jetlag) return;

  const offset = target - epoch;
  install(globalThis, offset);

  try {
    if (globalThis.performance && typeof performance.timeOrigin === 'number') {
      Object.defineProperty(performance, 'timeOrigin', { value: performance.timeOrigin + offset, configurable: true });
    }
  } catch {}

  const vm = require('vm');
  const createContext = vm.createContext;
  const source = `(${install.toString()})(globalThis, ${offset});`;
  vm.createContext = function jetlagCreateContext(...args) {
    const context = createContext.apply(this, args);
    try {
      vm.runInContext(source, context);
    } catch {}
    return context;
  };

  const marker = process.env.JETLAG_MARKER;
  if (marker) {
    try {
      require('fs').appendFileSync(marker, 'node\n');
    } catch {}
  }

  // Runs in the main context and, as source text, inside vm contexts, so it
  // must not reference anything outside itself.
  function install(g, offset) {
    const RealDate = g.Date;
    if (RealDate.__jetlag) return;
    const realNow = RealDate.now;
    const now = () => realNow() + offset;

    function Date(...args) {
      if (!new.target) return new RealDate(now()).toString();
      const date = args.length === 0 ? new RealDate(now()) : new RealDate(...args);
      if (new.target !== Date) Object.setPrototypeOf(date, new.target.prototype);
      return date;
    }
    Object.defineProperties(Date, {
      length: { value: 7 },
      prototype: { value: RealDate.prototype },
      now: { value: function now_() { return now(); }, writable: true, configurable: true },
      parse: { value: RealDate.parse, writable: true, configurable: true },
      UTC: { value: RealDate.UTC, writable: true, configurable: true },
      __jetlag: { value: true },
    });
    Object.defineProperty(Date.now, 'name', { value: 'now' });
    Object.defineProperty(RealDate.prototype, 'constructor', { value: Date, writable: true, configurable: true });
    g.Date = Date;

    // Intl formatters read "now" through the original Date.now when called
    // without a date.
    const DTF = g.Intl && g.Intl.DateTimeFormat;
    if (DTF) {
      const desc = Object.getOwnPropertyDescriptor(DTF.prototype, 'format');
      if (desc && desc.get) {
        Object.defineProperty(DTF.prototype, 'format', {
          configurable: true,
          get() {
            const format = desc.get.call(this);
            return (date) => format(date === undefined ? now() : date);
          },
        });
      }
      const formatToParts = DTF.prototype.formatToParts;
      DTF.prototype.formatToParts = function (date) {
        return formatToParts.call(this, date === undefined ? now() : date);
      };
    }

    // Temporal.Now, where the runtime has it.
    const T = g.Temporal;
    if (T && T.Now && T.Instant) {
      const instant = () => T.Instant.fromEpochMilliseconds(now());
      const zone = (tz) => (tz === undefined ? T.Now.timeZoneId() : tz);
      Object.assign(T.Now, {
        instant,
        zonedDateTimeISO: (tz) => instant().toZonedDateTimeISO(zone(tz)),
        plainDateTimeISO: (tz) => instant().toZonedDateTimeISO(zone(tz)).toPlainDateTime(),
        plainDateISO: (tz) => instant().toZonedDateTimeISO(zone(tz)).toPlainDate(),
        plainTimeISO: (tz) => instant().toZonedDateTimeISO(zone(tz)).toPlainTime(),
      });
    }
  }
})();
