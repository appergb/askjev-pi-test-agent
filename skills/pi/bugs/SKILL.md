---
name: bugs
description: Classify real test outcomes and finish a Pi test report with requirement quotes and reproducible failure evidence.
---

Use after runTests. Read each actual result and distinguish assertion failure, invalid generated test, environment failure and pass. A score alone is never a finding.

Use finishReport to return one analysis per failed case: case_id, category, title, expected and actual. The executor attaches actual logs by case_id. You may omit evidence_excerpt; if supplied, it must quote the execution output. A mismatched optional excerpt is replaced with an authoritative executor excerpt, never accepted as new evidence. For confirmed_product_defect, ensure the test assertion matches the quoted requirement and the source explains the observed failure. If that connection is uncertain use suspected_issue. Syntax or wrong API use is generated_test_error; sandbox or timeout failures are environment_error.

Identify the concrete requirement violated. Group related evidence by case without inflating unique defect counts. State limitations in the report. Passing tests mean no failure observed within this run's scope; they do not establish absence of bugs.

Example: a requirement permits quantity 10, but assert.doesNotThrow fails with RangeError. Cite the exact assertion output and describe the boundary mismatch. A connection timeout is an environment error, not a product bug.
