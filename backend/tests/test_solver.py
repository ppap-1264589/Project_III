import unittest

from app.solver import solve_timetable


class SolverTests(unittest.TestCase):
    def solve(self, *, demands, qualified, slots, busy=(), class_busy=(), teachers=None):
        teachers = teachers or {teacher_id: teacher_id for teacher_id, _ in qualified}
        subjects = {subject_id: subject_id for _, subject_id in demands}
        classes = {class_id: class_id for class_id, _ in demands}
        return solve_timetable(
            demands=demands,
            qualified=qualified,
            slots=slots,
            busy=busy,
            class_busy=class_busy,
            teacher_names=teachers,
            class_names=classes,
            subject_names=subjects,
            min_periods=1,
            workers=1,
        )

    def test_minimum_shortfall_is_soft_and_reported(self):
        result = self.solve(
            demands={("C1", "S1"): 1},
            qualified={("T1", "S1")},
            slots=[{"id": "P1", "weekday": "Thứ Hai", "session": "Sáng", "period": 1}],
            teachers={"T1": "Teacher 1", "T2": "Teacher 2"},
        )

        self.assertEqual(result["status"], "optimal")
        self.assertEqual(len(result["schedule"]), 1)
        self.assertEqual([row["periods"] for row in result["teacher_loads"]], [1, 0])
        self.assertEqual(len(result["warnings"]), 1)
        self.assertIn("Teacher 2", result["warnings"][0])

    def test_objective_balances_load_when_assignment_allows_it(self):
        result = self.solve(
            demands={("C1", "S1"): 1, ("C2", "S1"): 1},
            qualified={("T1", "S1"), ("T2", "S1")},
            slots=[
                {"id": "P1", "weekday": "Thứ Hai", "session": "Sáng", "period": 1},
                {"id": "P2", "weekday": "Thứ Hai", "session": "Sáng", "period": 2},
            ],
        )

        self.assertEqual(result["status"], "optimal")
        self.assertEqual([row["periods"] for row in result["teacher_loads"]], [1, 1])
        self.assertEqual(result["warnings"], [])

    def test_class_cannot_be_double_booked(self):
        result = self.solve(
            demands={("C1", "S1"): 1, ("C1", "S2"): 1},
            qualified={("T1", "S1"), ("T1", "S2")},
            slots=[{"id": "P1", "weekday": "Thứ Hai", "session": "Sáng", "period": 1}],
        )

        self.assertEqual(result["status"], "infeasible")

    def test_teacher_cannot_be_double_booked(self):
        result = self.solve(
            demands={("C1", "S1"): 1, ("C2", "S1"): 1},
            qualified={("T1", "S1")},
            slots=[{"id": "P1", "weekday": "Thứ Hai", "session": "Sáng", "period": 1}],
        )

        self.assertEqual(result["status"], "infeasible")

    def test_blocked_class_slot_is_not_assigned(self):
        result = self.solve(
            demands={("C1", "S1"): 1},
            qualified={("T1", "S1")},
            slots=[
                {"id": "P1", "weekday": "Thứ Hai", "session": "Sáng", "period": 1},
                {"id": "P2", "weekday": "Thứ Ba", "session": "Sáng", "period": 1},
            ],
            class_busy={("C1", "Thứ Hai", "Sáng", 1)},
        )

        self.assertEqual(result["status"], "optimal")
        self.assertEqual([row["slot_id"] for row in result["schedule"]], ["P2"])

    def test_blocked_teacher_slot_is_not_assigned(self):
        result = self.solve(
            demands={("C1", "S1"): 1},
            qualified={("T1", "S1")},
            slots=[
                {"id": "P1", "weekday": "Thứ Hai", "session": "Sáng", "period": 1},
                {"id": "P2", "weekday": "Thứ Ba", "session": "Sáng", "period": 1},
            ],
            busy={("T1", "Thứ Hai", "Sáng", 1)},
        )

        self.assertEqual(result["status"], "optimal")
        self.assertEqual([row["slot_id"] for row in result["schedule"]], ["P2"])


if __name__ == "__main__":
    unittest.main()
