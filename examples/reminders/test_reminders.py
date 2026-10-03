import unittest
from datetime import date, datetime

from reminders import anniversary, days_in_year, today_key, utc_offset_label


class Reminders(unittest.TestCase):
    def test_today_key_is_the_local_date(self):
        self.assertEqual(today_key(), date.today().isoformat())

    def test_anniversary_of_today_exists(self):
        today = date.today()
        self.assertEqual(anniversary(today).month, today.month)

    def test_offset_label_matches_the_clock(self):
        offset = datetime.now().astimezone().utcoffset().total_seconds() // 60
        sign = "-" if offset < 0 else "+"
        hours, minutes = divmod(abs(int(offset)), 60)
        self.assertEqual(utc_offset_label(), "UTC%s%02d:%02d" % (sign, hours, minutes))

    def test_this_year_has_the_right_number_of_days(self):
        year = date.today().year
        expected = (date(year + 1, 1, 1) - date(year, 1, 1)).days
        self.assertEqual(days_in_year(year), expected)


if __name__ == "__main__":
    unittest.main()
