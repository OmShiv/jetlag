<h1 align="center">jetlag</h1>

<p align="center"><b>Your tests have never left your laptop. Send them on a trip.</b></p>

<p align="center">
  <img src="docs/demo.gif" width="800" alt="jetlag runs a test suite at home and in ten destinations, then lists the eight date bugs it found">
</p>

jetlag runs your test suite in other time zones, on the dates that break date code, and in other languages. Then it tells you which tests broke, where, and why.

```sh
npx jetlagged npm test
```

It works with any test command. No config, no dependencies, nothing to change in your code.

## Install

```sh
npm install --global jetlagged    # then: jetlag npm test
```

Requires Node.js 20 or later. The tests it runs can be in any language.

## Usage

```sh
jetlag npm test                                # the quick trip: 10 destinations
jetlag --trip world -- python3 -m pytest -q    # all 28
jetlag --only utc,leap-day -- npx vitest run
jetlag --tz Europe/Paris --at 2027-03-28T01:30 -- npm test
jetlag exec kathmandu -- npm test              # one destination, full output
jetlag list                                    # every destination
```

## Where it sends your tests

- **Time zones:** UTC, Los Angeles at 9:30 PM, Kiritimati (UTC+14), Kathmandu (UTC+05:45), Lord Howe Island's 30-minute daylight saving, and more.
- **Tricky dates:** daylight saving changes, New Year's Eve, leap day, January 31, the ISO week-year boundary, 2038, and 2100.
- **Languages:** German, Turkish, Arabic, Thai, Persian, Hindi, and POSIX.

Time zones and languages apply to every program. The clock moves in Node.js, Python, and Ruby, including inside Jest and Vitest workers. Tests that already fail at home aren't blamed on a destination, and failures are re-run alone to rule out flaky tests.

Try it on [`examples/billing`](examples/billing): eight passing tests, eight date bugs.

## CI

```yaml
- run: npx jetlagged --trip world -- npm test
```

jetlag exits with 1 when a destination breaks a test, and with 2 when your tests already fail at home.

## License

[MIT](LICENSE)
