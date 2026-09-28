import os
import tempfile
import unittest

from timetiles.scraper.output import OutputWriter


class ToCsvStringTest(unittest.TestCase):
    def test_rows_without_fields_raise(self):
        writer = OutputWriter(output_dir="/nonexistent")
        writer.write_rows([{}, {}])
        with self.assertRaisesRegex(ValueError, "2 rows but none has a field"):
            writer.to_csv_string()

    def test_no_rows_is_an_empty_file(self):
        self.assertEqual(OutputWriter(output_dir="/nonexistent").to_csv_string(), "")

    def test_columns_are_the_union_of_all_rows(self):
        writer = OutputWriter(output_dir="/nonexistent")
        writer.write_rows([{"title": "A"}, {"title": "B", "price": "3"}])
        self.assertEqual(writer.to_csv_string(), "title,price\r\nA,\r\nB,3\r\n")


class SaveTest(unittest.TestCase):
    def test_rows_without_fields_leave_no_file(self):
        with tempfile.TemporaryDirectory() as output_dir:
            writer = OutputWriter(output_dir=output_dir)
            writer.write_row({})
            with self.assertRaises(ValueError):
                writer.save()
            self.assertFalse(os.path.exists(os.path.join(output_dir, "data.csv")))


if __name__ == "__main__":
    unittest.main()
