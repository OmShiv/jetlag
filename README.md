<h1 align="center">jetlag</h1>

<p align="center"><b>Your tests have never left your laptop. Send them on a trip.</b></p>

<p align="center">
  <img src="docs/demo.gif" width="800" alt="jetlag runs a test suite at home and in ten destinations, then lists the eight date bugs it found">
</p>

jetlag runs your test suite somewhere else: in other time zones, on the dates that break date code, and in other languages. Then it tells you which tests broke, where, and why.

```sh
npx github:OmShiv/jetlag npm test
```

It works with any test command. It changes the time zone and language for every program, and it moves the clock for Node.js, Python, and Ruby, even inside Jest's sandboxes and Vitest's workers. There's no config, no dependency, and nothing to change in your code.

## Why

Every run of your tests happens in the same place. Your laptop runs them in your time zone, in your language, within a few hours of the last run. Your CI runs them in UTC. Neither one runs them at 9:30 PM in Los Angeles, when `new Date().toISOString()` already says tomorrow. Neither runs them on February 29, on the night New York skips 2:30 AM, or on a machine that writes numbers as `1.234,50`.

So date bugs wait. They arrive as a ticket from a customer in Nepal, a test that fails every December 31, or a billing job that charges on March 3 instead of February 28.

jetlag runs those days now.

## What it finds

[`examples/billing`](examples/billing) is a small billing module with eight passing tests. Here's what one `jetlag npm test` finds in it:

| The code | Breaks in | Because |
|---|---|---|
| `date.toISOString().slice(0, 10)` as "today" | Los Angeles 9:30 PM, Kiritimati 7:30 AM, New Year's Eve | the UTC date isn't the local date |
| `date.getTime() + 24 * 60 * 60 * 1000` for "same time tomorrow" | Spring forward | that day has 23 hours |
| `next.setMonth(next.getMonth() + 1)` | January 31 | February 31 overflows to March 3 |
| `next.setFullYear(next.getFullYear() + 1)` | Leap day | February 29, 2029 doesn't exist, so it becomes March 1 |
| `` `${year}-${month + 2}` `` for next month | New Year's Eve | December plus one is month 13 |
| `Math.trunc(-date.getTimezoneOffset() / 60)` | Kathmandu | Nepal is 5 hours and 45 minutes ahead of UTC |
| `amount.toLocaleString()` | German | German writes 1234.5 as 1.234,50 |
| `date.toLocaleDateString(undefined, { year: 'numeric' })` | Thai | the Buddhist calendar says 2569 |

All eight tests pass on the laptop the module was written on. [`examples/reminders`](examples/reminders) does the same for Python.

## Install

Run it without installing:

```sh
npx github:OmShiv/jetlag npm test
```

Or install it globally, or as a dev dependency:

```sh
npm install --global github:OmShiv/jetlag
npm install --save-dev github:OmShiv/jetlag
```

jetlag needs Node.js 18.14 or later to run. The tests it runs can be in any language.

## Usage

```sh
jetlag npm test                                   # the quick trip: 10 destinations
jetlag --trip world -- python3 -m pytest -q       # all 28 destinations
jetlag --only utc,leap-day -- npx vitest run      # just these
jetlag --skip languages -- bundle exec rspec      # everything in the quick trip but languages
jetlag --tz Europe/Paris --at 2027-03-28T01:30 -- npm test   # a destination of your own
jetlag exec spring-forward -- npm test            # one destination, full output
jetlag exec kathmandu -- node                     # a Node.js REPL in Kathmandu
jetlag list                                       # every destination
```

When a destination breaks a test, the report explains what's different there and prints a `jetlag exec` line that reproduces it with the test runner's full output.

```
Options
  -t, --trip <name>     quick (default), zones, calendar, languages, world
  -o, --only <ids>      run these destinations (comma-separated ids or trip names)
  -s, --skip <ids>      leave these destinations out
      --tz <zone>       add your own destination in this IANA time zone
      --at <datetime>   start its clock at this local time, like 2027-03-28T01:30
      --locale <name>   give it this locale, like fr_FR.UTF-8
  -j, --jobs <n>        destinations to run at once (default: half your cores, up to 4)
      --timeout <sec>   stop a run after this many seconds (default: 600)
      --no-confirm      don't re-run failures alone to rule out flaky tests
      --json            print a JSON report instead of the table
  -v, --verbose         print the full output of failing runs
```

jetlag exits with 0 when every destination passes, 1 when a destination breaks a test, and 2 when your tests already fail at home (with no new failures elsewhere) or the command line is wrong.

## Destinations

★ marks the quick trip, which runs by default. `--trip zones`, `--trip calendar`, and `--trip languages` run one group; `--trip world` runs all 28.

### Time zones

| Destination | Where and when | What it catches |
|---|---|---|
| `utc` ★ | `UTC`, noon today | Most CI runners use UTC. If your machine doesn't, code that mixes local and UTC dates can pass on your laptop and fail in CI. |
| `los-angeles-night` ★ | `America/Los_Angeles`, 9:30 PM today | At 9:30 PM in Los Angeles it's already the next day in UTC, so new Date().toISOString().slice(0, 10) returns tomorrow's date. |
| `kiritimati` ★ | `Pacific/Kiritimati`, 7:30 AM today | Kiritimati is UTC+14, the first place on Earth to start each day. Until 2 PM local time, its date is a day ahead of UTC. |
| `kathmandu` ★ | `Asia/Kathmandu`, noon today | Nepal is UTC+05:45. Code that assumes offsets are whole hours, or rounds getTimezoneOffset() / 60, is 15 to 45 minutes off. |
| `india` | `Asia/Kolkata`, noon today | India is UTC+05:30 all year. Half-hour offsets break code that stores or formats offsets as whole hours. |
| `chatham` | `Pacific/Chatham`, noon today | The Chatham Islands use UTC+12:45, and UTC+13:45 during daylight saving: a 45-minute offset that also changes with the seasons. |
| `lord-howe` | `Australia/Lord_Howe`, noon today | Daylight saving on Lord Howe Island moves the clock by 30 minutes, not an hour. Code that adds or subtracts exactly one hour for DST is wrong here. |
| `troll` | `Antarctica/Troll`, noon today | Troll research station switches between UTC+00 and UTC+02: daylight saving that moves the clock by two hours. |
| `sydney` | `Australia/Sydney`, noon today | In the southern hemisphere, daylight saving runs from October to April. Code that assumes summer time falls in July is wrong here. |
| `london` | `Europe/London`, noon today | London matches UTC only in winter. From late March to late October it is UTC+01, so code that treats London as UTC is an hour off for half the year. |
| `casablanca` | `Africa/Casablanca`, noon today | Morocco is on UTC+01 most of the year and switches to UTC+00 for Ramadan, so its clock changes move with the lunar calendar. |
| `anywhere-on-earth` | `Etc/GMT+12`, noon today | UTC-12 is the last time zone to finish each day, which is why deadlines use it. Its IANA name is Etc/GMT+12 because POSIX-style names flip the sign. |

### Tricky dates

| Destination | Where and when | What it catches |
|---|---|---|
| `spring-forward` ★ | `America/New_York`, 1:30 AM on the next spring-forward day | Clocks jump from 1:59:59 AM to 3:00 AM. The day is 23 hours long, 2:30 AM doesn't exist, and adding 24 hours doesn't land on the same time tomorrow. |
| `fall-back` | `America/New_York`, 1:30 AM on the next fall-back day | Clocks go from 1:59:59 AM back to 1:00 AM. The day is 25 hours long, 1:30 AM happens twice, and adding 24 hours lands an hour early. |
| `new-years-eve` ★ | your time zone, 11:58 PM on December 31 | Two minutes to midnight on December 31. Code that reads the clock twice can straddle two years, and code that computes next month by hand produces month 13. |
| `leap-day` ★ | your time zone, noon on the next February 29 | February 29. "Same day next year" has no answer, and code that hard-codes 28 days in February or 365 days in a year is a day off. |
| `month-end` ★ | your time zone, noon on the next January 31 | Add one month to January 31 and JavaScript's setMonth() overflows to March 3 (March 2 in a leap year). Monthly dates drift. |
| `iso-week` | your time zone, noon on the next day whose ISO week-year isn't its calendar year | The ISO week-year differs from the calendar year here. Code that pairs an ISO week number with the calendar year, or formats with a week-year pattern like Java's YYYY, prints the wrong year. |
| `sunday` | your time zone, noon next Sunday | getDay() returns 0 on Sundays. Code that assumes weeks start on Monday, or uses getDay() - 1 as an index, breaks one day a week. |
| `y2038` | 2038-01-19 03:14:08 UTC | One second past 03:14:07 UTC on January 19, 2038, the largest signed 32-bit Unix time. Seconds stored in 32 bits, or truncated with \| 0 in JavaScript, wrap to negative numbers. |
| `year-2100` | your time zone, noon on 2100-02-28 | 2100 is divisible by 4 but isn't a leap year, so tomorrow is March 1. A year % 4 === 0 leap-year check says February 29. |

### Languages

| Destination | Where and when | What it catches |
|---|---|---|
| `german` ★ | `LANG=de_DE.UTF-8` | German formats 1234.5 as 1.234,5. Tests that expect US-formatted toLocaleString() output fail, and parseFloat('1,5') returns 1. |
| `turkish` | `LANG=tr_TR.UTF-8` | Turkish has a dotted and a dotless i (i/İ and ı/I). Locale-aware sorting and casing change, and Java's toUpperCase() and toLowerCase() follow this rule by default. |
| `arabic` | `LANG=ar_EG.UTF-8` | Numbers format with Arabic-Indic digits by default (١٬٢٣٤٫٥). Parsing localized output back with Number() returns NaN. |
| `thai` ★ | `LANG=th_TH.UTF-8` | The default calendar is Buddhist, so toLocaleDateString() reports the year 2026 as 2569. |
| `persian` | `LANG=fa_IR.UTF-8` | The default calendar is the Solar Hijri calendar, written with Persian digits: October 3, 2026 formats as ۱۴۰۵/۷/۱۱. |
| `hindi` | `LANG=hi_IN.UTF-8` | Indian digit grouping puts a comma every two digits after the first three: 1234567 formats as 12,34,567. |
| `posix` | `LANG=C` | The plain C locale has no UTF-8. Ruby defaults to US-ASCII here, and tools that pick an encoding from LANG mangle non-ASCII text. |

## How it works

**Time zones and languages are environment variables.** jetlag sets `TZ`, `LANG`, and `LC_ALL` for your command, and every runtime reads them. Node.js brings its own locale data, so German and Thai formatting work even on machines without those locales installed.

**The clock needs help.** No environment variable says "it's February 29", so jetlag loads a small preload into each runtime it knows: `NODE_OPTIONS=--require` for Node.js, a `sitecustomize.py` on `PYTHONPATH` for Python, and `RUBYOPT=-r` for Ruby. The preload moves the wall clock (`Date`, `Intl`, and `Temporal.Now` in JavaScript; `time.time()` and `datetime` in Python; `Time.now` and `Date.today` in Ruby) to the destination's start time, and the clock keeps ticking from there. Timeouts, durations, and `performance.now()` still work.

Jest runs each test file in its own `vm` context with its own `Date`, so the Node.js preload also patches every context it creates. Worker threads and child processes load the preload themselves. All of them share one starting point, so a test runner and its workers agree on what time it is.

**Your machine goes first.** jetlag runs your command at home before it leaves. If a test already fails at home, jetlag doesn't blame a destination for it: it reports only new failures.

**Parallel failures get a second look.** Destinations run four at a time. When one fails, jetlag runs it again by itself. If it passes alone, jetlag reports it as flaky (usually shared ports or files) instead of as a date bug.

**jetlag knows when it couldn't move the clock.** Each preload leaves a marker when it takes effect. If none did, because your tests are in Go or Java, jetlag reports the date destinations as skipped instead of passed. Time zones and languages still apply.

## Runtimes

| | Time zones and languages | Clock |
|---|---|---|
| Node.js | ✓ | ✓ |
| Python | ✓ | ✓ |
| Ruby | ✓ | ✓ |
| Go, Rust, Java, .NET, everything else | ✓ | reported as skipped |

The test suite and examples are verified with node:test, Jest 30, Vitest 3 (threads, forks, and vmThreads pools), Mocha 11, pytest 9, and unittest, on macOS and Linux.

## In CI

Run the whole world once a week, so date bugs show up before the dates do:

```yaml
name: jetlag
on:
  schedule:
    - cron: '0 6 * * 1'
  workflow_dispatch:

jobs:
  jetlag:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 22
      - run: npm ci
      - run: npx github:OmShiv/jetlag --trip world -- npm test
```

Linux runners ship with only a few system locales. That doesn't matter for Node.js. For Python's `locale` module or Ruby, generate the ones you need first, for example `sudo locale-gen de_DE.UTF-8 tr_TR.UTF-8`.

## FAQ

**Does it change my system clock?** No. Only the processes jetlag starts see a different time, time zone, or language, and only while they run.

**Why not fake timers?** Fake timers are great for code you already know is about time. jetlag is for the code that doesn't look like it: a `toISOString()` inside a formatter, a `+ 86400000` inside a scheduler. You can't write a test for a bug you haven't thought of, so jetlag runs the tests you have in the places you haven't been.

**Is it slow?** It runs your suite once at home, once per destination (four at a time), and once more for each destination that fails. For the quick trip that's about four runs' worth of time, plus the re-runs. Use `--only` while you fix things, and `--no-confirm` to skip the re-runs.

**Windows?** Not tested yet. The time zone, language, and clock mechanisms are standard on macOS and Linux.

## License

[MIT](LICENSE)
