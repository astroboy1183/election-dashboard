# Party → alliance mapping per state
# color: hex used for charts and map rendering

ALLIANCES = {
    "tamil-nadu": {
        # Pre-poll alliances preserved as-is (INC stays in SPA). Post-poll government
        # formation captured separately under `government` so the dashboard's swing /
        # alliance analytics keep showing the original electoral alignment.
        "alliances": [
            {"id": "tvk-alliance", "name": "TVK Alliance", "color": "#FFD700"},
            {"id": "spa",          "name": "Secular Progressive Alliance (SPA)", "color": "#E63946"},
            {"id": "nda-tn",       "name": "AIADMK-led Alliance (NDA)", "color": "#2A9D8F"},
            {"id": "others-tn",    "name": "Others", "color": "#A8DADC"},
        ],
        "parties": {
            "TVK":    {"alliance": "tvk-alliance", "color": "#FFD700", "full_name": "Tamilaga Vettri Kazhagam"},
            "DMK":    {"alliance": "spa",          "color": "#E63946", "full_name": "Dravida Munnetra Kazhagam"},
            "INC":    {"alliance": "spa",          "color": "#1565C0", "full_name": "Indian National Congress"},
            "VCK":    {"alliance": "spa",          "color": "#7B2D8B", "full_name": "Viduthalai Chiruthaigal Katchi"},
            "MDMK":   {"alliance": "spa",          "color": "#FF6B35", "full_name": "Marumalarchi Dravida Munnetra Kazhagam"},
            "CPI":    {"alliance": "spa",          "color": "#CC0000", "full_name": "Communist Party of India"},
            "CPI(M)": {"alliance": "spa",          "color": "#8B0000", "full_name": "Communist Party of India (Marxist)"},
            "IUML":   {"alliance": "spa",          "color": "#006400", "full_name": "Indian Union Muslim League"},
            # DMDK was in NDA-TN in 2021, joined SPA pre-poll 2026 (inverse of UPPL's move in Assam).
            "DMDK":   {"alliance": "spa",          "alliance_2021": "nda-tn", "color": "#FF8C00", "full_name": "Desiya Murpokku Dravida Kazhagam"},
            "AIADMK": {"alliance": "nda-tn",       "color": "#2A9D8F", "full_name": "All India Anna Dravida Munnetra Kazhagam"},
            "BJP":    {"alliance": "nda-tn",       "color": "#FF6600", "full_name": "Bharatiya Janata Party"},
            "PMK":    {"alliance": "nda-tn",       "color": "#9B59B6", "full_name": "Pattali Makkal Katchi"},
            # AMMK contested as a third front in 2021 (Sasikala-led), joined NDA-TN for 2026.
            "AMMK":   {"alliance": "nda-tn",       "alliance_2021": "others-tn", "color": "#3498DB", "full_name": "Amma Makkal Munnetra Kazhagam"},
        },
        # Post-poll government formation override (consumed only by Overview "For Majority" modal)
        "government": {
            "forms_government": "tvk-alliance",
            # Parties that formally joined the government despite being from a different
            # pre-poll alliance (counted toward majority, not "outside" support).
            "coalition_members": ["INC"],
            # Parties that remain in their original alliance but provide outside
            # (issue-by-issue) support to keep the government in power.
            "outside_support_parties": ["VCK", "CPI", "CPI(M)", "DMDK"],
            "chief_minister": "C. Joseph Vijay",
            "sworn_in": "10 May 2026",
            "note": "TVK contested alone and won 108 seats. INC left SPA post-poll and formally joined the TVK government. 4 SPA parties (VCK, CPI, CPI(M), DMDK) extend outside support to clear the 118 majority threshold.",
        },
    },
    "kerala": {
        # Wikipedia 2026 verified composition:
        #   UDF: INC, IUML, KC, RSP, KC(J), RMPI, CMP-KSC, INL + 4 UDF-aligned winning independents
        #   LDF: CPI(M), CPI, RJD, NCPSP
        #   NDA: BJP, BDJS, TP (Twenty20 Party)
        # All 4 winning independents in 2026 are UDF-aligned (see winning_independents_alliance);
        # losing independents stay in the unassigned "others" bucket.
        "winning_independents_alliance": "udf",
        "alliances": [
            {"id": "ldf",       "name": "Left Democratic Front (LDF)", "color": "#CC0000"},
            {"id": "udf",       "name": "United Democratic Front (UDF)", "color": "#1565C0"},
            {"id": "nda-kl",    "name": "NDA", "color": "#FF6600"},
            {"id": "others-kl", "name": "Others", "color": "#A8DADC"},
        ],
        "parties": {
            "CPI(M)": {"alliance": "ldf",       "color": "#CC0000", "full_name": "Communist Party of India (Marxist)"},
            "CPI":    {"alliance": "ldf",       "color": "#E63946", "full_name": "Communist Party of India"},
            "RJD":    {"alliance": "ldf",       "color": "#A0522D", "full_name": "Rashtriya Janata Dal"},
            "NCPSP":  {"alliance": "ldf",       "color": "#9B59B6", "full_name": "Nationalist Congress Party–Sharadchandra Pawar"},
            # Kerala Congress (Mani) — LDF since 2020 split from UDF.
            "KC(M)":  {"alliance": "ldf",       "color": "#FF8C00", "full_name": "Kerala Congress (M)"},
            "INC":    {"alliance": "udf",       "color": "#1565C0", "full_name": "Indian National Congress"},
            "IUML":   {"alliance": "udf",       "color": "#006400", "full_name": "Indian Union Muslim League"},
            # Kerala Congress (Joseph) — UDF.
            "KC":     {"alliance": "udf",       "color": "#FFA500", "full_name": "Kerala Congress"},
            # ECI's LS-2024 abbreviation for the broader Kerala Congress
            # (used in the Successful-Candidates XLS — e.g. Adv K Francis
            # George who won Kottayam). Same UDF alignment as "KC" — kept
            # as a separate token so we don't silently rename ingested data.
            "KEC":    {"alliance": "udf",       "color": "#FFA500", "full_name": "Kerala Congress (KEC)"},
            # Kerala Congress (B) — Balakrishna Pillai faction; aligned with UDF in 2026.
            "KC(B)":  {"alliance": "udf",       "color": "#FF6347", "full_name": "Kerala Congress (B)"},
            "RSP":    {"alliance": "udf",       "color": "#8B0000", "full_name": "Revolutionary Socialist Party"},
            "RMPI":   {"alliance": "udf",       "color": "#7B68EE", "full_name": "Revolutionary Marxist Party of India"},
            "KC(J)":  {"alliance": "udf",       "color": "#FFC0CB", "full_name": "Kerala Congress (Jacob)"},
            "CMPKSC": {"alliance": "udf",       "color": "#9370DB", "full_name": "CMP Kerala Social Congress"},
            "INL":    {"alliance": "udf",       "color": "#2E8B57", "full_name": "Indian National League"},
            # Synthetic party for the alliance-aligned winning independents (split out from "I").
            "IND-W":  {"alliance": "udf",       "color": "#A8DADC", "full_name": "Independent (UDF-aligned)"},
            "BJP":    {"alliance": "nda-kl",    "color": "#FF6600", "full_name": "Bharatiya Janata Party"},
            "BDJS":   {"alliance": "nda-kl",    "color": "#FFA07A", "full_name": "Bharath Dharma Jana Sena"},
            "TP":     {"alliance": "nda-kl",    "color": "#FF7F50", "full_name": "Twenty20 Party"},
        },
    },
    "west-bengal": {
        # Wikipedia 2026 verified composition:
        #   AITC Alliance: AITC, BGPM
        #   NDA: BJP (alone, no formal allies)
        #   Left Front: CPI(M), CPI, RSP, AIFB, AISF (=ISF), CPI(ML)L
        #   Others (non-aligned): INC, SUCI, BSP, AJU, AIMIM, JLKM, etc.
        "alliances": [
            {"id": "tmc-alliance", "name": "AITC Alliance",    "color": "#00A86B"},
            {"id": "nda-wb",       "name": "NDA",              "color": "#FF6600"},
            {"id": "left-wb",      "name": "Left Front",       "color": "#CC0000"},
            {"id": "others-wb",    "name": "Others",           "color": "#A8DADC"},
        ],
        "parties": {
            "AITC":   {"alliance": "tmc-alliance", "color": "#00A86B", "full_name": "All India Trinamool Congress"},
            "BGPM":   {"alliance": "tmc-alliance", "color": "#2E8B57", "full_name": "Bharatiya Gorkha Prajatantrik Morcha"},
            "BJP":    {"alliance": "nda-wb",       "color": "#FF6600", "full_name": "Bharatiya Janata Party"},
            "CPI(M)": {"alliance": "left-wb",      "color": "#CC0000", "full_name": "Communist Party of India (Marxist)"},
            "CPI":    {"alliance": "left-wb",      "color": "#E63946", "full_name": "Communist Party of India"},
            "RSP":    {"alliance": "left-wb",      "color": "#8B0000", "full_name": "Revolutionary Socialist Party"},
            "AIFB":   {"alliance": "left-wb",      "color": "#B22222", "full_name": "All India Forward Bloc"},
            "AISF":   {"alliance": "left-wb",      "color": "#8B008B", "full_name": "All India Secular Front (ISF)"},
            "CPI(L)": {"alliance": "left-wb",      "color": "#B0171F", "full_name": "Communist Party of India (Marxist-Leninist) Liberation"},
            "INC":    {"alliance": "others-wb",    "color": "#1565C0", "full_name": "Indian National Congress"},
            "AJU":    {"alliance": "others-wb",    "color": "#A8DADC", "full_name": "Aam Janata Unnayan Party"},
        },
    },
    "assam": {
        # Wikipedia 2026 verified alliance composition:
        #   NDA  (48.02%): BJP + AGP + BPF
        #   ASM  (35.95%): INC + RD + AJP + CPI(M) + CPI(ML)(L) [+ alliance-endorsed independents]
        #   AIUDF (5.46%): contested independently, not in any alliance
        #   UPPL did NOT contest as part of NDA for 2026 (separate path)
        "alliances": [
            {"id": "nda-as",   "name": "NDA",                          "color": "#FF6600"},
            {"id": "asm",      "name": "Asom Sonmilito Morcha (ASM)",  "color": "#1565C0"},
            {"id": "others-as","name": "Others",                       "color": "#A8DADC"},
        ],
        "parties": {
            "BJP":         {"alliance": "nda-as",    "color": "#FF6600", "full_name": "Bharatiya Janata Party"},
            "AGP":         {"alliance": "nda-as",    "color": "#FF8C00", "full_name": "Asom Gana Parishad"},
            # BPF was in the Mahajot (Congress-led opposition) in 2021, then joined NDA for 2026.
            "BPF":         {"alliance": "nda-as",    "alliance_2021": "asm", "color": "#FFD700", "full_name": "Bodoland People's Front"},
            "INC":         {"alliance": "asm",       "color": "#1565C0", "full_name": "Indian National Congress"},
            "RD":          {"alliance": "asm",       "color": "#00BCD4", "full_name": "Raijor Dal"},
            "AJP":         {"alliance": "asm",       "color": "#FF1493", "full_name": "Assam Jatiya Parishad"},
            "CPI(M)":      {"alliance": "asm",       "color": "#8B0000", "full_name": "Communist Party of India (Marxist)"},
            "CPI(L)":      {"alliance": "asm",       "color": "#B0171F", "full_name": "Communist Party of India (Marxist-Leninist) Liberation"},
            # AIUDF was in the Mahajot (Congress-led opposition) in 2021, then contested independently in 2026.
            "AIUDF":       {"alliance": "others-as", "alliance_2021": "asm", "color": "#00BCD4", "full_name": "All India United Democratic Front"},
            # UPPL contested independently for 2026 but was part of NDA in 2021 — keep both
            # mappings so swing/alliance roll-ups can use the right one per year.
            "UPPL":        {"alliance": "others-as", "alliance_2021": "nda-as", "color": "#FFA500", "full_name": "United People's Party Liberal"},
            "AITC":        {"alliance": "others-as", "color": "#00A86B", "full_name": "All India Trinamool Congress"},
        },
    },
    "puducherry": {
        # Wikipedia 2026: NDA (AINRC+BJP+LJK+AIADMK)=18; SPA (INC+DMK+VCK)=6; TVK+ (TVK+NMK)=3; Ind=3
        "alliances": [
            {"id": "nda-pu",   "name": "NDA (AINRC+BJP+AIADMK+LJK)", "color": "#FF6600"},
            {"id": "spa-pu",   "name": "Secular Alliance (INC+DMK)", "color": "#1565C0"},
            {"id": "tvk-pu",   "name": "TVK+ Alliance",              "color": "#FFD700"},
            {"id": "others-pu","name": "Others",                     "color": "#A8DADC"},
        ],
        "parties": {
            "AINC":   {"alliance": "nda-pu",    "color": "#FF6600", "full_name": "All India N.R. Congress"},
            "BJP":    {"alliance": "nda-pu",    "color": "#FF8C00", "full_name": "Bharatiya Janata Party"},
            "AIADMK": {"alliance": "nda-pu",    "color": "#2A9D8F", "full_name": "All India Anna Dravida Munnetra Kazhagam"},
            "LJK":    {"alliance": "nda-pu",    "color": "#FF4500", "full_name": "Latchiya Jananayaka Katchi"},
            "INC":    {"alliance": "spa-pu",    "color": "#1565C0", "full_name": "Indian National Congress"},
            "DMK":    {"alliance": "spa-pu",    "color": "#E63946", "full_name": "Dravida Munnetra Kazhagam"},
            "VCK":    {"alliance": "spa-pu",    "color": "#7B2D8B", "full_name": "Viduthalai Chiruthaigal Katchi"},
            "TVK":    {"alliance": "tvk-pu",    "color": "#FFD700", "full_name": "Tamilaga Vettri Kazhagam"},
            "NMK":    {"alliance": "tvk-pu",    "color": "#FFA500", "full_name": "Nam Makkal Katchi"},
            "I":      {"alliance": "others-pu", "color": "#C0C0C0", "full_name": "Independent"},
        },
    },
}
