from app.ingest.section_parser import parse_numbered_sections_en, parse_smk2
from tests.helpers import lines_from_pages

SMK2 = """
BAB I
PENDAHULUAN
Tenaga listrik penting.
BAB II
SISTEM MANAJEMEN
Pengantar bab dua.
ELEMEN A: Penetapan Kebijakan Badan Usaha
1. Manajemen menunjukkan komitmen.
ELEMEN
B: Penetapan Organisasi SMK2
1. Struktur organisasi.
BAB III
PENUTUP
Selesai.
"""

EN = """
1 INTRODUCTION
General text of the handbook.
1.1 Purpose
Purpose text.
1. a numbered list item that is not a heading.
1.2 Scope
Scope text.
2 GENERAL REQUIREMENTS
Requirements text.
"""


def test_smk2_bab_and_elemen() -> None:
    res = parse_smk2(lines_from_pages(SMK2))
    keys = [u.key for u in res.units]
    assert keys == ["BABI", "BABII", "BABII-ELA", "BABII-ELB", "BABIII"]
    assert res.units[2].hierarchy["elemen"] == "A"
    assert res.units[3].label.startswith("Elemen B")


def test_english_numbered_sections_reject_list_items() -> None:
    res = parse_numbered_sections_en(lines_from_pages(EN))
    keys = [u.key for u in res.units]
    assert keys == ["S1", "S1_1", "S1_2", "S2"]
    purpose = res.units[1]
    assert any("not a heading" in ln.text for ln in purpose.lines)
