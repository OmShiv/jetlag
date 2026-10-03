"""Reminder helpers that pass their tests on the machine they were written on.

Run `npx github:OmShiv/jetlag python3 -m unittest` in this folder to see where they don't.
"""

from datetime import date, datetime, timezone


def today_key():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def anniversary(day):
    return day.replace(year=day.year + 1)


def utc_offset_label():
    hours = int(datetime.now().astimezone().utcoffset().total_seconds() // 3600)
    return "UTC%+03d:00" % hours


def days_in_year(year):
    return 366 if year % 4 == 0 else 365
